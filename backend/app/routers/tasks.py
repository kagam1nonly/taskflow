from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.dependencies.auth import get_current_user_id
from app.models import Board, Column, Task
from app.services.ai_breakdown import generate_task_breakdown
from app.services.realtime import realtime_broadcaster

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


@router.post("/{board_id}/tasks/breakdown")
async def create_breakdown(
    board_id: UUID,
    payload: BreakdownRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Depends(get_current_user_id),
) -> list[dict[str, Optional[str]]]:
    board = await session.get(Board, board_id)
    if not board or board.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")

    return generate_task_breakdown(payload.prompt)
