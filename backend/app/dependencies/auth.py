from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=True)


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(settings.jwks_url)


def _get_signing_key(token: str):
    client = _jwks_client()
    return client.get_signing_key_from_jwt(token)


def _allowed_issuers() -> set[str]:
    # Supabase legacy JWT projects often use `iss=supabase`.
    # We also allow both the /auth/v1 version and the base project URL.
    return {
        settings.jwt_issuer, 
        "supabase", 
        settings.supabase_url,
        settings.supabase_url.rstrip("/") + "/auth/v1"
    }


def _validate_issuer(payload: dict) -> None:
    issuer = payload.get("iss")
    if not issuer:
        raise InvalidTokenError("Token missing issuer.")
    
    # Normalize by stripping trailing slashes for comparison
    normalized_allowed = {i.rstrip("/") for i in _allowed_issuers() if i}
    if issuer.rstrip("/") not in normalized_allowed:
        raise InvalidTokenError(f"Invalid token issuer: {issuer}")


def _decode_with_jwks(token: str) -> dict:
    signing_key = _get_signing_key(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256", "HS256"],
        audience=settings.supabase_jwt_audience,
        options={"verify_iss": False},
        leeway=60,
    )
    _validate_issuer(payload)
    return payload


def _decode_with_secret(token: str, secret: str) -> dict:
    payload = jwt.decode(
        token,
        secret,
        algorithms=["HS256", "RS256"],
        audience=settings.supabase_jwt_audience,
        options={"verify_iss": False},
        leeway=60,
    )
    _validate_issuer(payload)
    return payload


def _decode_token_or_raise(token: str) -> dict:
    payload: dict | None = None

    try:
        payload = _decode_with_jwks(token)
    except Exception:
        if settings.supabase_jwt_secret:
            try:
                payload = _decode_with_secret(token, settings.supabase_jwt_secret)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token.",
                ) from exc
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token.",
            )

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject.",
        )

    return payload


async def get_current_user_claims(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    return _decode_token_or_raise(token)


async def get_current_user_id(claims: dict = Depends(get_current_user_claims)) -> str:
    return str(claims["sub"])
