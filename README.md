# TaskFlow

TaskFlow is a premium, real-time Kanban board with AI-powered task decomposition. Built with FastAPI, Next.js, and Gemini 2.5.

![TaskFlow Preview](./frontend/public/assets/preview.png)

## Key Features
- **✨ AI Breakdown**: Describe a goal, and Gemini will automatically generate a structured task list.
- **🔄 Real-time Sync**: Changes reflect instantly across all connected clients via WebSockets and Redis.
- **🖐️ Smart Drag & Drop**: Smooth reordering and column-swapping powered by `@dnd-kit/sortable`.
- **🔐 Secure & Persistent**: Authentication and managed PostgreSQL database integration with Supabase.
- **🎨 Premium UI**: Dark mode, glassmorphism, and smooth animations using Tailwind CSS.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), Tailwind CSS, dnd-kit.
- **Backend**: FastAPI, SQLModel (SQLAlchemy), PostgreSQL (Managed by Supabase).
- **Real-time**: Redis Pub/Sub, WebSockets.
- **AI**: Google Gemini 2.5 (Flash & Pro).

## Quick Start (Docker)

The easiest way to run TaskFlow is using Docker Compose.

1. **Clone the repository**
2. **Configure Environment Variables**:
   - Copy `backend/.env.example` to `backend/.env` and add your `GEMINI_API_KEY` and Supabase credentials.
   - Copy `frontend/.env.example` to `frontend/.env.local` and add your Supabase URL and Anon Key.
3. **Run with Docker**:
   ```bash
   docker compose up --build
   ```
4. **Access the App**:
   - Frontend: [http://localhost:4000](http://localhost:4000)
   - API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Status
Check [PROJECT_STATUS.md](./PROJECT_STATUS.md) for detailed progress and technical implementation notes.
