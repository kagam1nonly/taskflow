from collections.abc import AsyncGenerator
import logging
import os

from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    connect_args={"statement_cache_size": 0},
    poolclass=NullPool,
)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Bootstrap database tables.

    In production, schema changes MUST go through Alembic migrations
    (``alembic upgrade head``).  ``create_all`` is only used as a dev
    convenience — it will NOT run when ``ENV=production``.
    """
    env = os.getenv("ENV", "development").lower()
    if env == "production":
        logger.info(
            "Production mode — skipping create_all. "
            "Run 'alembic upgrade head' to apply migrations."
        )
        return

    logger.warning(
        "Development mode — running create_all as a safety net. "
        "Use 'alembic upgrade head' for proper migration tracking."
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

