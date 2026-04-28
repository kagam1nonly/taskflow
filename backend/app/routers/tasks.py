from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.dependencies.auth import get_current_user_id
from app.models import Board, Column, Task
from app.services.ai_breakdown import generate_task_breakdown
from app.services.realtime import realtime_broadcaster
from app.core.limiter import limiter

router = APIRouter(prefix="/boards", tags=["tasks"])


class CreateBoardRequest(SQLModel):
    name: str


class CreateColumnRequest(SQLModel):
    title: str
    position: int = 0


class CreateTaskRequest(SQLModel):
    column_id: UUID
    title: str
    description: Optional[str] = None
    position: int = 0
    status: str = "todo"


class MoveTaskRequest(SQLModel):
    column_id: UUID
    position: int
    status: str


class UpdateTaskRequest(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None


class BreakdownRequest(SQLModel):
    prompt: str


@router.post("", response_model=Board, status_code=status.HTTP_201_CREATED)
async def create_board(
    payload: CreateBoardRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> Board:
    board = Board(owner_id=user_id, name=payload.name)
    session.add(board)
    await session.commit()
    await session.refresh(board)
    return board


@router.get("", response_model=list[Board])
async def list_boards(
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> list[Board]:
    statement = select(Board).where(Board.owner_id == user_id).order_by(Board.created_at.desc())
    result = await session.exec(statement)
    return list(result.all())


@router.post("/{board_id}/columns", response_model=Column, status_code=status.HTTP_201_CREATED)
async def create_column(
    board_id: UUID,
    payload: CreateColumnRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> Column:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    column = Column(board_id=board_id, title=payload.title, position=payload.position)
    session.add(column)
    await session.commit()
    await session.refresh(column)

    await realtime_broadcaster.publish(
        board_id,
        {"type": "column.created", "payload": column.model_dump(mode="json")},
    )

    return column


@router.get("/{board_id}/columns", response_model=list[Column])
async def list_columns(
    board_id: UUID,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> list[Column]:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    statement = select(Column).where(Column.board_id == board_id).order_by(Column.position.asc())
    result = await session.exec(statement)
    return list(result.all())


@router.get("/{board_id}/tasks", response_model=list[Task])
async def list_tasks(
    board_id: UUID,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> list[Task]:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    statement = select(Task).where(Task.board_id == board_id).order_by(Task.position.asc())
    result = await session.exec(statement)
    return list(result.all())


@router.post("/{board_id}/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    board_id: UUID,
    payload: CreateTaskRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> Task:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    task = Task(
        board_id=board_id,
        column_id=payload.column_id,
        title=payload.title,
        description=payload.description,
        position=payload.position,
        status=payload.status,
        created_by=user_id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    await realtime_broadcaster.publish(
        board_id,
        {"type": "task.created", "payload": task.model_dump(mode="json")},
    )

    return task


@router.patch("/{board_id}/tasks/{task_id}", response_model=Task)
async def move_task(
    board_id: UUID,
    task_id: UUID,
    payload: MoveTaskRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> Task:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    task = await session.get(Task, task_id)
    if not task or task.board_id != board_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    # Shift other tasks if needed
    if task.column_id == payload.column_id:
        if task.position < payload.position:
            # Moving down
            # Actually use a simpler update statement approach
            from sqlalchemy import update
            await session.execute(
                update(Task)
                .where(Task.column_id == task.column_id)
                .where(Task.position > task.position)
                .where(Task.position <= payload.position)
                .values(position=Task.position - 1)
            )
        elif task.position > payload.position:
            # Moving up
            from sqlalchemy import update
            await session.execute(
                update(Task)
                .where(Task.column_id == task.column_id)
                .where(Task.position < task.position)
                .where(Task.position >= payload.position)
                .values(position=Task.position + 1)
            )
    else:
        # Cross column move: shift target column down
        from sqlalchemy import update
        await session.execute(
            update(Task)
            .where(Task.column_id == payload.column_id)
            .where(Task.position >= payload.position)
            .values(position=Task.position + 1)
        )

    task.column_id = payload.column_id
    task.position = payload.position
    task.status = payload.status
    task.updated_at = datetime.utcnow()

    session.add(task)
    await session.commit()
    await session.refresh(task)

    await realtime_broadcaster.publish(
        board_id,
        {"type": "task.moved", "payload": task.model_dump(mode="json")},
    )

    return task


@router.patch("/{board_id}/tasks/{task_id}/edit", response_model=Task)
async def edit_task(
    board_id: UUID,
    task_id: UUID,
    payload: UpdateTaskRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> Task:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    task = await session.get(Task, task_id)
    if not task or task.board_id != board_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    task.updated_at = datetime.utcnow()

    session.add(task)
    await session.commit()
    await session.refresh(task)

    await realtime_broadcaster.publish(
        board_id,
        {"type": "task.updated", "payload": task.model_dump(mode="json")},
    )

    return task


@router.delete("/{board_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    board_id: UUID,
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> None:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    task = await session.get(Task, task_id)
    if not task or task.board_id != board_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    await session.delete(task)
    await session.commit()

    await realtime_broadcaster.publish(
        board_id,
        {"type": "task.deleted", "payload": {"id": str(task_id)}},
    )


@router.post("/{board_id}/tasks/breakdown", response_model=list[Task])
@limiter.limit("10/minute")
async def create_breakdown(
    request: Request,
    board_id: UUID,
    payload: BreakdownRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> list[Task]:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    # Get suggested tasks from AI
    suggestions = await generate_task_breakdown(payload.prompt)
    
    # Get the first column to put them in
    result = await session.execute(
        select(Column).where(Column.board_id == board_id).order_by(Column.position)
    )
    first_column = result.scalars().first()
    if not first_column:
        raise HTTPException(status_code=400, detail="No columns found on board to add tasks to.")

    # Get current max position in that column
    result = await session.execute(
        select(Task).where(Task.column_id == first_column.id).order_by(Task.position.desc())
    )
    last_task = result.scalars().first()
    start_pos = (last_task.position + 1) if last_task else 0

    created_tasks = []
    for i, item in enumerate(suggestions):
        task = Task(
            board_id=board_id,
            column_id=first_column.id,
            title=item["title"],
            description=item["description"],
            position=start_pos + i,
            status=first_column.title.lower().replace(" ", "_"),
            created_by=user_id,
        )
        session.add(task)
        created_tasks.append(task)

    await session.commit()
    
    # Refresh all and broadcast
    for task in created_tasks:
        await session.refresh(task)
        await realtime_broadcaster.publish(
            board_id,
            {"type": "task.created", "payload": task.model_dump(mode="json")},
        )

    return created_tasks
