import asyncio
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




async def _keep_alive():
    """Background task to ping the server and prevent Render from sleeping."""
    import httpx
    import asyncio
    
    url = settings.render_external_url
    if not url:
        return
        
    health_url = f"{url.rstrip('/')}/health"
    print(f"INFO: Keep-alive task started. Pinging {health_url} every 14 minutes.")
    
    async with httpx.AsyncClient() as client:
        while True:
            try:
                # Wait 14 minutes (Render sleeps after 15 mins of inactivity)
                await asyncio.sleep(14 * 60)
                response = await client.get(health_url)
                print(f"DEBUG: Keep-alive ping to {health_url}: {response.status_code}")
            except Exception as e:
                print(f"WARNING: Keep-alive ping failed: {e}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    # Start the keep-alive task in the background
    ka_task = asyncio.create_task(_keep_alive())
    yield
    ka_task.cancel()
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


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(tasks_router, prefix=settings.api_prefix)
app.include_router(websocket_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
