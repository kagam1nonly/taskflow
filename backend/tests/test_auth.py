import pytest
from httpx import AsyncClient

from app.core.config import settings

pytestmark = pytest.mark.asyncio


async def test_auth_me_success(async_client: AsyncClient, auth_headers: dict[str, str]):
    response = await async_client.get(f"{settings.api_prefix}/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "test-user-id-123"
    assert data["email"] == "test@example.com"
    assert data["role"] == "authenticated"


async def test_auth_me_no_token(async_client: AsyncClient):
    response = await async_client.get(f"{settings.api_prefix}/auth/me")
    assert response.status_code == 403 or response.status_code == 401


async def test_auth_me_invalid_token(async_client: AsyncClient):
    response = await async_client.get(
        f"{settings.api_prefix}/auth/me",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401
