from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.realtime import websocket_hub

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/boards/{board_id}")
async def board_events(websocket: WebSocket, board_id: UUID) -> None:
    # Auth can be extended by validating a Supabase JWT from query params or headers.
    await websocket_hub.connect(board_id, websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await websocket_hub.disconnect(board_id, websocket)
