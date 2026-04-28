import pytest
from httpx import AsyncClient

from app.core.config import settings

pytestmark = pytest.mark.asyncio


async def test_crud_flow(async_client: AsyncClient, auth_headers: dict[str, str]):
    # 1. Create a Board
    board_res = await async_client.post(
        f"{settings.api_prefix}/boards",
        json={"name": "Test Board"},
        headers=auth_headers,
    )
    assert board_res.status_code == 201
    board_id = board_res.json()["id"]

    # 2. List Boards
    boards_res = await async_client.get(
        f"{settings.api_prefix}/boards", headers=auth_headers
    )
    assert boards_res.status_code == 200
    boards = boards_res.json()
    assert len(boards) >= 1
    assert any(b["id"] == board_id for b in boards)

    # 3. Create a Column
    col_res = await async_client.post(
        f"{settings.api_prefix}/boards/{board_id}/columns",
        json={"title": "To Do", "position": 0},
        headers=auth_headers,
    )
    assert col_res.status_code == 201
    col_id = col_res.json()["id"]

    # 4. List Columns
    cols_res = await async_client.get(
        f"{settings.api_prefix}/boards/{board_id}/columns", headers=auth_headers
    )
    assert cols_res.status_code == 200
    cols = cols_res.json()
    assert len(cols) == 1
    assert cols[0]["id"] == col_id

    # 5. Create a Task
    task_res = await async_client.post(
        f"{settings.api_prefix}/boards/{board_id}/tasks",
        json={
            "column_id": col_id,
            "title": "Test Task",
            "description": "Task description",
            "position": 0,
            "status": "todo",
        },
        headers=auth_headers,
    )
    assert task_res.status_code == 201
    task_id = task_res.json()["id"]

    # 6. List Tasks
    tasks_res = await async_client.get(
        f"{settings.api_prefix}/boards/{board_id}/tasks", headers=auth_headers
    )
    assert tasks_res.status_code == 200
    tasks = tasks_res.json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == task_id

    # 7. Edit the Task
    edit_res = await async_client.patch(
        f"{settings.api_prefix}/boards/{board_id}/tasks/{task_id}/edit",
        json={"title": "Updated Task Title"},
        headers=auth_headers,
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["title"] == "Updated Task Title"
    assert edit_res.json()["description"] == "Task description"

    # 8. Move the Task
    move_res = await async_client.patch(
        f"{settings.api_prefix}/boards/{board_id}/tasks/{task_id}",
        json={"column_id": col_id, "position": 1, "status": "in_progress"},
        headers=auth_headers,
    )
    assert move_res.status_code == 200
    assert move_res.json()["status"] == "in_progress"
    assert move_res.json()["position"] == 1

    # 9. Delete the Task
    del_res = await async_client.delete(
        f"{settings.api_prefix}/boards/{board_id}/tasks/{task_id}", headers=auth_headers
    )
    assert del_res.status_code == 204

    # Verify Task is Deleted
    tasks_res_after = await async_client.get(
        f"{settings.api_prefix}/boards/{board_id}/tasks", headers=auth_headers
    )
    assert len(tasks_res_after.json()) == 0


async def test_unauthorized_crud(async_client: AsyncClient):
    res = await async_client.post(
        f"{settings.api_prefix}/boards", json={"name": "No Auth"}
    )
    assert res.status_code == 403 or res.status_code == 401
