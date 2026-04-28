import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.core.config import settings

pytestmark = pytest.mark.asyncio


@patch("app.routers.tasks.generate_task_breakdown")
async def test_ai_breakdown_success(
    mock_generate, async_client: AsyncClient, auth_headers: dict[str, str]
):
    mock_generate.return_value = [
        {"title": "Task 1", "description": "Desc 1"},
        {"title": "Task 2", "description": "Desc 2"},
    ]

    # Create a board first
    board_res = await async_client.post(
        f"{settings.api_prefix}/boards",
        json={"name": "AI Board"},
        headers=auth_headers,
    )
    board_id = board_res.json()["id"]

    # Request breakdown
    payload = {"prompt": "Build a test app"}
    headers = {**auth_headers, "X-Forwarded-For": "1.1.1.1"}
    res = await async_client.post(
        f"{settings.api_prefix}/boards/{board_id}/tasks/breakdown",
        json=payload,
        headers=headers,
    )

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["title"] == "Task 1"
    mock_generate.assert_called_once_with("Build a test app")


@patch("app.routers.tasks.generate_task_breakdown")
async def test_ai_breakdown_rate_limit(
    mock_generate, async_client: AsyncClient, auth_headers: dict[str, str]
):
    mock_generate.return_value = [{"title": "Task", "description": "Desc"}]

    # Create a board
    board_res = await async_client.post(
        f"{settings.api_prefix}/boards",
        json={"name": "Rate Limit Board"},
        headers=auth_headers,
    )
    board_id = board_res.json()["id"]

    payload = {"prompt": "Build a test app"}

    # SlowAPI limit is 5/minute. Send 6 requests.
    for i in range(5):
        headers_rate_limit = {**auth_headers, "X-Forwarded-For": "2.2.2.2"}
        res = await async_client.post(
            f"{settings.api_prefix}/boards/{board_id}/tasks/breakdown",
            json=payload,
            headers=headers_rate_limit,
        )
        # Assuming the first 5 succeed. However, tests share rate limit state,
        # so if test_ai_breakdown_success ran first, this might fail earlier.
        # It's better to just keep sending until we get a 429.
    
    # Send one more that should definitely fail
    res = await async_client.post(
        f"{settings.api_prefix}/boards/{board_id}/tasks/breakdown",
        json=payload,
        headers=headers_rate_limit,
    )
    assert res.status_code == 429
    assert "limit exceeded" in res.json()["error"].lower()


async def test_ai_breakdown_not_found(async_client: AsyncClient, auth_headers: dict[str, str]):
    fake_board_id = str(uuid.uuid4())
    headers_not_found = {**auth_headers, "X-Forwarded-For": "3.3.3.3"}
    res = await async_client.post(
        f"{settings.api_prefix}/boards/{fake_board_id}/tasks/breakdown",
        json={"prompt": "Build a test app"},
        headers=headers_not_found,
    )
    assert res.status_code == 404
