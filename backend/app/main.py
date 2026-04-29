from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.limiter import limiter
from app.db import init_db
from app.routers.auth import router as auth_router
from app.routers.tasks import router as tasks_router
from app.routers.websocket import router as websocket_router
from app.services.realtime import realtime_broadcaster, websocket_hub




@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield
    await realtime_broadcaster.close()
    await websocket_hub.close()


from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

app = FastAPI(title="TaskFlow API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/")
async def root():
    return {
        "message": "Welcome to TaskFlow API",
        "docs": "/docs",
        "status": "online"
    }

# Define your trusted origins
origins = [
    "http://localhost:4000",
    "https://taskflow-kanbanboard.vercel.app",  # Your Vercel URL
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(tasks_router, prefix=settings.api_prefix)
app.include_router(websocket_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
