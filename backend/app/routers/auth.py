from typing import Optional

from fastapi import APIRouter, Depends
from sqlmodel import SQLModel

from app.dependencies.auth import get_current_user_claims

router = APIRouter(prefix="/auth", tags=["auth"])


class CurrentUserResponse(SQLModel):
    user_id: str
    email: Optional[str] = None
    role: Optional[str] = None


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(claims: dict = Depends(get_current_user_claims)) -> CurrentUserResponse:
    return CurrentUserResponse(
        user_id=str(claims["sub"]),
        email=claims.get("email"),
        role=claims.get("role"),
    )
