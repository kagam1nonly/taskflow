from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.config import settings
from app.core.limiter import limiter
from app.db import init_db, get_session
from app.routers.auth import router as auth_router
from app.routers.tasks import router as tasks_router
from app.routers.websocket import router as websocket_router
from app.services.realtime import realtime_broadcaster, websocket_hub

# ─── CORS CONFIGURATION ──────────────────────────────────────────────────────
# Build the explicit origins list (with and without trailing slash variants)
_raw_origins: list[str] = list(settings.allowed_origins)
_expanded: list[str] = []
for _o in _raw_origins:
    _expanded.append(_o.rstrip("/"))
    _expanded.append(_o.rstrip("/") + "/")
origins: list[str] = list(set(_expanded))

# ─── LIFESPAN (Startup/Shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_: FastAPI):
    print(f"Starting up... Allowed origins: {origins}")
    await init_db()
    yield
    # Cleanup on shutdown
    await realtime_broadcaster.close()
    await websocket_hub.close()

# ─── APP INITIALIZATION ──────────────────────────────────────────────────────
app = FastAPI(title="TaskFlow API", version="0.1.0", lifespan=lifespan)

# ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
# IMPORTANT: Middleware MUST be registered BEFORE routers so that preflight
# OPTIONS requests receive CORS headers even when the handler doesn't exist yet.

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Catch-all for Vercel preview deployments (e.g. taskflow-xxx-team.vercel.app)
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Length"],
    max_age=600,
)

# Rate Limiter Setup (after middleware, before routes)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── ROUTES ──────────────────────────────────────────────────────────────────

@app.get("/")
@app.head("/")
async def root():
    return {
        "message": "Welcome to TaskFlow API",
        "docs": "/docs",
        "status": "online"
    }

# THE DEEP HEALTH CHECK
# This keeps the Render Postgres instance from going to sleep.
@app.get("/health")
@app.head("/health")
async def health(db: AsyncSession = Depends(get_session)) -> dict[str, str]:
    try:
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "online"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database connection failed: {str(e)}"
        )

# ─── ROUTERS ─────────────────────────────────────────────────────────────────

app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(tasks_router, prefix=settings.api_prefix)
app.include_router(websocket_router)