import asyncio
import contextlib
import json
from collections import defaultdict
from collections.abc import AsyncGenerator
from uuid import UUID

from fastapi import WebSocket
from redis.asyncio import Redis

from app.core.config import settings


class RealtimeBroadcaster:
    def __init__(self, redis_url: str):
        self._redis = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

    @staticmethod
    def board_channel(board_id: UUID) -> str:
        return f"board:{board_id}"

    async def publish(self, board_id: UUID, event: dict) -> None:
        await self._redis.publish(self.board_channel(board_id), json.dumps(event))

    async def close(self) -> None:
        await self._redis.aclose()


class WebSocketHub:
    def __init__(self, redis_url: str):
        self._redis = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._listeners: dict[UUID, asyncio.Task] = {}

    async def connect(self, board_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[board_id].add(websocket)

        if board_id not in self._listeners:
            self._listeners[board_id] = asyncio.create_task(self._listen_board(board_id))

    async def disconnect(self, board_id: UUID, websocket: WebSocket) -> None:
        connections = self._connections.get(board_id)
        if not connections:
            return

        connections.discard(websocket)

        if connections:
            return

        self._connections.pop(board_id, None)
        listener = self._listeners.pop(board_id, None)
        if listener:
            listener.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await listener

    async def _listen_board(self, board_id: UUID) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(RealtimeBroadcaster.board_channel(board_id))

        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue

                data = message.get("data")
                if not data:
                    continue

                await self._broadcast(board_id, data)
        finally:
            await pubsub.unsubscribe(RealtimeBroadcaster.board_channel(board_id))
            await pubsub.close()

    async def _broadcast(self, board_id: UUID, payload: str) -> None:
        dead_connections: list[WebSocket] = []

        for ws in self._connections.get(board_id, set()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead_connections.append(ws)

        for ws in dead_connections:
            await self.disconnect(board_id, ws)

    async def close(self) -> None:
        for task in self._listeners.values():
            task.cancel()
        self._listeners.clear()
        self._connections.clear()
        await self._redis.aclose()


realtime_broadcaster = RealtimeBroadcaster(settings.redis_url)
websocket_hub = WebSocketHub(settings.redis_url)
