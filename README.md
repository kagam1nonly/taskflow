# TaskFlow

Real-time Kanban board with AI task breakdown.

## Stack

- Backend: FastAPI + SQLModel + PostgreSQL (Supabase)
- Realtime: FastAPI WebSockets + Redis pub/sub
- Frontend: Next.js App Router + TypeScript + Tailwind + dnd-kit
- Auth: Supabase Auth JWT passed to FastAPI

## Project Structure

- `backend/`: FastAPI app, SQLModel models, routers, Redis broadcast service
- `frontend/`: Next.js app with Kanban UI and API/WebSocket integration

## Backend Quick Start

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set values.
4. Run API:
   - `uvicorn app.main:app --reload --port 8000`

## Frontend Quick Start

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env.local` and set values.
3. Run app:
   - `npm run dev`

## Backend Endpoints

- `GET /health`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/boards/{board_id}/columns`
- `POST /api/boards/{board_id}/columns`
- `GET /api/boards/{board_id}/tasks`
- `POST /api/boards/{board_id}/tasks`
- `PATCH /api/boards/{board_id}/tasks/{task_id}`
- `POST /api/boards/{board_id}/tasks/breakdown`
- `WS /ws/boards/{board_id}`
