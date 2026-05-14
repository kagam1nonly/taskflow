from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from app.core.config import settings
from app.core.limiter import limiter
from app.db import init_db, get_session # Updated based on your tasks.py
from app.routers.auth import router as auth_router
from app.routers.tasks import router as tasks_router
from app.routers.websocket import router as websocket_router
from app.services.realtime import realtime_broadcaster, websocket_hub

# ─── CORS CONFIGURATION ──────────────────────────────────────────────────────
origins = settings.allowed_origins
extended_origins = list(origins)
for origin in origins:
    if origin.endswith("/"):
        extended_origins.append(origin.rstrip("/"))
    else:
        extended_origins.append(origin + "/")
origins = list(set(extended_origins))

# ─── LIFESPAN (Startup/Shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_: FastAPI):
    print(f"Starting up... Allowed origins: {origins}")
    # This initializes the DB connection on Render startup
    await init_db()
    yield
    # Cleanup on shutdown
    await realtime_broadcaster.close()
    await websocket_hub.close()

# ─── APP INITIALIZATION ──────────────────────────────────────────────────────
app = FastAPI(title="TaskFlow API", version="0.1.0", lifespan=lifespan)

# Rate Limiter Setup
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
# This is the "Magic" that keeps your Render Database from falling asleep.
@app.get("/health")
@app.head("/health")
async def health(db: AsyncSession = Depends(get_session)) -> dict[str, str]:
    try:
        # We use 'await' because your project uses SQLModel/SQLAlchemy Async
        # This forces the Postgres database to wake up and answer.
        await db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "database": "online"
        }
    except Exception as e:
        # If the database is unreachable, Render will see this 500 error
        raise HTTPException(
            status_code=500, 
            detail=f"Database connection failed: {str(e)}"
        )

# ─── MIDDLEWARE & ROUTERS ────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(tasks_router, prefix=settings.api_prefix)
app.include_router(websocket_router)