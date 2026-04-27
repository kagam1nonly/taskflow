"use client";

import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import {
  Board,
  BoardColumn,
  CurrentUser,
  Task,
  createBoard,
  createColumn,
  createTask,
  getCurrentUser,
  getBreakdown,
  listBoards,
  listColumns,
  listTasks,
  moveTask,
} from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

function dedupeAndSortTasks(items: Task[]): Task[] {
  const byId = new Map<string, Task>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => a.position - b.position);
}

function dedupeAndSortColumns(items: BoardColumn[]): BoardColumn[] {
  const byId = new Map<string, BoardColumn>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => a.position - b.position);
}

type ColumnLaneProps = {
  column: BoardColumn;
  tasks: Task[];
  onAddTask: (column: BoardColumn) => Promise<void>;
};

function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-sm ${
        isDragging ? "opacity-60" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <h4 className="font-semibold text-slate-900">{task.title}</h4>
      {task.description ? <p className="mt-2 text-slate-600">{task.description}</p> : null}
    </article>
  );
}

function ColumnLane({ column, tasks, onAddTask }: ColumnLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column } });

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-80 min-w-70 flex-1 flex-col gap-3 rounded-2xl border p-4 ${
        isOver ? "border-amber-500 bg-amber-100/60" : "border-slate-300 bg-white/80"
      }`}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-700">{column.title}</h3>
        <button
          type="button"
          onClick={() => onAddTask(column)}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
        >
          Add
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}

export default function KanbanBoard() {
  const supabaseClient = getSupabaseBrowserClient();
  const supabaseConfigError = !supabaseClient
    ? "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend env."
    : null;

  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseClient);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  const refreshBoardData = useCallback(
    async (boardId: string, activeToken: string) => {
      const [boardColumns, boardTasks] = await Promise.all([
        listColumns(boardId, activeToken),
        listTasks(boardId, activeToken),
      ]);

      let ensuredColumns = boardColumns;
      if (boardColumns.length === 0) {
        ensuredColumns = await Promise.all(
          DEFAULT_COLUMNS.map((title, index) =>
            createColumn(
              boardId,
              {
                title,
                position: index,
              },
              activeToken,
            ),
          ),
        );
      }

      setColumns(dedupeAndSortColumns(ensuredColumns));
      setTasks(dedupeAndSortTasks(boardTasks));
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    if (!token) {
      setBoards([]);
      setColumns([]);
      setTasks([]);
      setSelectedBoardId(null);
      return;
    }

    setError(null);
    setIsRefreshing(true);
    try {
      const availableBoards = await listBoards(token);
      if (availableBoards.length === 0) {
        const created = await createBoard("TaskFlow Board", token);
        setBoards([created]);
        setSelectedBoardId(created.id);
        await refreshBoardData(created.id, token);
        return;
      }

      setBoards(availableBoards);
      const initialBoardId = availableBoards[0].id;
      setSelectedBoardId(initialBoardId);
      await refreshBoardData(initialBoardId, token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load board.");
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBoardData, token]);

  useEffect(() => {
    const supabase = supabaseClient;
    if (!supabase) {
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setToken(data.session?.access_token ?? "");
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? "");
      if (!session) {
        setCurrentUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseClient]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void bootstrap();
  }, [authReady, bootstrap]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    void getCurrentUser(token)
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load user profile.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useBoardRealtime(
    selectedBoardId,
    useCallback((event) => {
      if (event.type === "task.created") {
        setTasks((previous) => dedupeAndSortTasks([...previous, event.payload as Task]));
      }

      if (event.type === "task.moved") {
        const moved = event.payload as Task;
        setTasks((previous) =>
          dedupeAndSortTasks(previous.map((task) => (task.id === moved.id ? moved : task))),
        );
      }

      if (event.type === "column.created") {
        const created = event.payload as BoardColumn;
        setColumns((previous) => dedupeAndSortColumns([...previous, created]));
      }
    }, []),
  );

  async function handleAddTask(column: BoardColumn): Promise<void> {
    if (!selectedBoardId || !token) {
      setError("Sign in first before creating tasks.");
      return;
    }

    const title = window.prompt("Task title");
    if (!title) {
      return;
    }

    setError(null);
    try {
      await createTask(
        selectedBoardId,
        {
          column_id: column.id,
          title,
          status: column.title.toLowerCase().replace(/\s+/g, "_"),
          position: tasks.filter((task) => task.column_id === column.id).length,
        },
        token,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to create task.");
    }
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    if (!selectedBoardId || !token || !event.over) {
      return;
    }

    const task = event.active.data.current?.task as Task | undefined;
    if (!task) {
      return;
    }

    const targetColumnId = String(event.over.id);
    if (!columns.some((column) => column.id === targetColumnId)) {
      return;
    }

    const nextPosition = tasks.filter((item) => item.column_id === targetColumnId).length;

    setError(null);
    try {
      await moveTask(
        selectedBoardId,
        task.id,
        {
          column_id: targetColumnId,
          position: nextPosition,
          status:
            columns.find((column) => column.id === targetColumnId)?.title.toLowerCase().replace(/\s+/g, "_") ??
            "todo",
        },
        token,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to move task.");
    }
  }

  async function handleBreakdown(): Promise<void> {
    if (!selectedBoardId || !token || !prompt.trim() || columns.length === 0) {
      setError("Sign in and refresh board first, then enter a prompt to generate tasks.");
      return;
    }

    setError(null);
    setIsGenerating(true);
    try {
      const generated = await getBreakdown(selectedBoardId, prompt, token);
      const firstColumn = columns[0];

      await Promise.all(
        generated.map((item, index) =>
          createTask(
            selectedBoardId,
            {
              column_id: firstColumn.id,
              title: item.title,
              description: item.description ?? undefined,
              status: firstColumn.title.toLowerCase().replace(/\s+/g, "_"),
              position: tasks.filter((task) => task.column_id === firstColumn.id).length + index,
            },
            token,
          ),
        ),
      );

      setPrompt("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to generate tasks.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSignIn(): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase frontend environment is not configured.");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Enter email and password.");
      return;
    }

    setError(null);
    setIsSigningIn(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      setPassword("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }

    setCurrentUser(null);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#fde68a_0%,#f8fafc_38%,#f1f5f9_100%)] px-6 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-300 bg-white/80 p-5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">TaskFlow</p>
              <h1 className="text-3xl font-black tracking-tight">Real-time Kanban + AI Breakdown</h1>
            </div>
            {!token ? (
              <div className="flex w-full max-w-lg flex-col gap-2">
                <p className="text-xs font-medium text-slate-600">Sign in with Supabase account</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    placeholder="Password"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void handleSignIn()}
                  className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningIn ? "Signing in..." : "Sign in"}
                </button>
              </div>
            ) : (
              <div className="flex w-full max-w-md flex-col items-start gap-2">
                <p className="text-sm text-slate-600">
                  Signed in as {currentUser?.email ?? currentUser?.user_id ?? "user"}
                </p>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              disabled={isRefreshing || !token}
              onClick={() => void bootstrap()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Board"}
            </button>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Break down feature work into tasks"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={isGenerating || !token}
              onClick={() => void handleBreakdown()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate with AI"}
            </button>
          </div>
          {selectedBoard ? (
            <p className="mt-3 text-sm text-slate-600">Active board: {selectedBoard.name}</p>
          ) : null}
          {error || supabaseConfigError ? (
            <p className="mt-3 text-sm text-red-600">{error ?? supabaseConfigError}</p>
          ) : null}
        </header>

        <DndContext onDragEnd={(event) => void handleDragEnd(event)}>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {columns.map((column) => (
              <ColumnLane
                key={column.id}
                column={column}
                tasks={tasks.filter((task) => task.column_id === column.id)}
                onAddTask={handleAddTask}
              />
            ))}
          </section>
        </DndContext>
      </div>
    </main>
  );
}
