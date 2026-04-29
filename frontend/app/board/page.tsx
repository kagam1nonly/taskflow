"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/components/Toast";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import {
  Board,
  BoardColumn,
  Task,
  createBoard,
  createColumn,
  createTask,
  deleteTask,
  editTask,
  getBreakdown,
  listBoards,
  listColumns,
  listTasks,
  moveTask,
  clearColumnTasks,
} from "@/lib/api";

import ColumnLane from "@/components/ColumnLane";
import TaskModal from "@/components/TaskModal";
import TaskCard from "@/components/TaskCard";

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

export default function BoardPage() {
  const { token, user, isLoading: authLoading, signOut } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const [prompt, setPrompt] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [activeColumn, setActiveColumn] = useState<BoardColumn | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Drag State
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);

  // Setup sensors for touch/mouse/pointer support
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Require the mouse to move by 10 pixels before starting drag
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      // Require a 250ms press-and-hold to start dragging on touch devices
      // This allows the user to still scroll the board normally
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor),
  );

  // Global drag cooldown — suppress ALL task.moved WebSocket events for a
  // short window after every local drag to prevent rubber-banding and
  // cascading position shifts from stale server echoes.
  const lastDragAt = useRef<number>(0);

  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  // Auth Protection
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/login");
    }
  }, [authLoading, token, router]);

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
            createColumn(boardId, { title, position: index }, activeToken),
          ),
        );
      }

      setColumns(dedupeAndSortColumns(ensuredColumns));
      setTasks(dedupeAndSortTasks(boardTasks));
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      const availableBoards = await listBoards(token);
      if (availableBoards.length === 0) {
        const created = await createBoard("TaskFlow Board", token);
        setBoards([created]);
        setSelectedBoardId(created.id);
        await refreshBoardData(created.id, token);
        toast("Created your first board!", "success");
        return;
      }

      setBoards(availableBoards);
      const initialBoardId = availableBoards[0].id;
      setSelectedBoardId(initialBoardId);
      await refreshBoardData(initialBoardId, token);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load board", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBoardData, token, toast]);

  useEffect(() => {
    if (token) {
      void bootstrap();
    }
  }, [token, bootstrap]);

  useBoardRealtime(
    selectedBoardId,
    useCallback((event) => {
      // task.created / task.updated — always apply immediately
      if (event.type === "task.created" || event.type === "task.updated") {
        const payloadTask = event.payload as Task;
        setTasks((prev) => dedupeAndSortTasks([...prev.filter(t => t.id !== payloadTask.id), payloadTask]));
      }

      // task.moved — suppress during the drag cooldown window to prevent
      // stale server echoes from overriding the user's optimistic UI.
      if (event.type === "task.moved") {
        if (Date.now() - lastDragAt.current < 3000) return;
        const payloadTask = event.payload as Task;
        setTasks((prev) => dedupeAndSortTasks([...prev.filter(t => t.id !== payloadTask.id), payloadTask]));
      }

      if (event.type === "task.deleted") {
        const { id } = event.payload as { id: string };
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }

      if (event.type === "column.cleared") {
        const { column_id } = event.payload as { column_id: string };
        setTasks((prev) => prev.filter((t) => t.column_id !== column_id));
      }

      if (event.type === "column.created") {
        setColumns((prev) => dedupeAndSortColumns([...prev, event.payload as BoardColumn]));
      }
    }, []),
  );

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setDraggingTask(task);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null);

    const { active, over } = event;
    if (!over || !selectedBoardId || !token) return;

    // IMPORTANT: dnd-kit event data (.data.current.task) contains the task
    // object from the *initial render*, which can be stale after rapid moves.
    // Always look up the LIVE task from React state for accurate column_id.
    const liveActiveTask = tasks.find((t) => t.id === active.id.toString());
    if (!liveActiveTask) return;

    const overId = over.id.toString();

    let targetColumnId: string;
    let targetIndex: number;

    const overData = over.data.current;
    
    if (overData?.column) {
      // Dropped directly onto an empty column zone
      targetColumnId = overData.column.id;
      targetIndex = 0;
    } else if (overData?.sortable) {
      // Dropped onto another task — look up live state for accurate column_id
      const liveOverTask = tasks.find((t) => t.id === overId);
      if (!liveOverTask) return;
      targetColumnId = liveOverTask.column_id;
      const sortableIndex = overData.sortable.index;
      targetIndex = typeof sortableIndex === "number" ? sortableIndex : 0;
    } else {
      return;
    }

    // Skip if it didn't really move
    if (liveActiveTask.column_id === targetColumnId && liveActiveTask.position === targetIndex) {
      return;
    }

    const previousTasks = [...tasks];

    // Optimistic update using arrayMove and position recalculation
    // We calculate everything inside the state setter to avoid stale closure bugs during rapid moves
    setTasks((prev) => {
      const activeIdx = prev.findIndex((t) => t.id === liveActiveTask.id);
      if (activeIdx === -1) return prev;
      
      const newTasks = [...prev];
      
      // Update the task's column
      const updatedTask = { ...newTasks[activeIdx], column_id: targetColumnId };
      newTasks[activeIdx] = updatedTask;

      const columnTasks = newTasks
        .filter((t) => t.column_id === targetColumnId)
        .sort((a, b) => a.position - b.position);
      
      const currentInColIdx = columnTasks.findIndex(t => t.id === liveActiveTask.id);
      let finalColumnTasks: Task[];
      
      if (currentInColIdx !== -1) {
        finalColumnTasks = arrayMove(columnTasks, currentInColIdx, targetIndex);
      } else {
        finalColumnTasks = [...columnTasks];
        finalColumnTasks.splice(targetIndex, 0, updatedTask);
      }

      // Re-map positions 0...N
      const updatedWithPositions = finalColumnTasks.map((t, i) => ({ ...t, position: i }));
      
      // Merge back into total tasks
      const otherTasks = newTasks.filter(t => t.column_id !== targetColumnId && t.id !== liveActiveTask.id);
      return dedupeAndSortTasks([...otherTasks, ...updatedWithPositions]);
    });

    // Mark the drag cooldown so WebSocket task.moved events are suppressed
    lastDragAt.current = Date.now();

    try {
      await moveTask(
        selectedBoardId,
        liveActiveTask.id,
        {
          column_id: targetColumnId,
          position: targetIndex,
          status:
            columns.find((c) => c.id === targetColumnId)?.title.toLowerCase().replace(/\s+/g, "_") ??
            "todo",
        },
        token,
      );
    } catch (err) {
      setTasks(previousTasks);
      toast(err instanceof Error ? err.message : "Failed to move task", "error");
    }
  }

  async function handleModalSubmit(data: { title: string; description: string }) {
    if (!selectedBoardId || !token) return;

    try {
      if (modalMode === "create" && activeColumn) {
        // Insert at top: position 0, shift everything else down
        const newTask = await createTask(
          selectedBoardId,
          {
            column_id: activeColumn.id,
            title: data.title,
            description: data.description || undefined,
            status: activeColumn.title.toLowerCase().replace(/\s+/g, "_"),
            position: 0,
          },
          token,
        );
        // Optimistic: put new task at top, shift existing down
        setTasks((prev) =>
          dedupeAndSortTasks([
            newTask,
            ...prev
              .filter((t) => t.column_id !== activeColumn.id)
              .concat(
                prev
                  .filter((t) => t.column_id === activeColumn.id)
                  .map((t) => ({ ...t, position: t.position + 1 })),
              ),
          ]),
        );
        toast("Task created", "success");
      } else if (modalMode === "edit" && activeTask) {
        // Optimistic UI Update
        setTasks((prev) =>
          prev.map((t) =>
            t.id === activeTask.id
              ? { ...t, title: data.title, description: data.description || null }
              : t
          )
        );
        
        await editTask(
          selectedBoardId,
          activeTask.id,
          { title: data.title, description: data.description || undefined },
          token,
        );
        toast("Task updated", "success");
      }
      setModalOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save task", "error");
    }
  }

  async function handleDeleteTask(task: Task) {
    if (!selectedBoardId || !token) return;

    // Optimistic delete
    setTasks((prev) => prev.filter((t) => t.id !== task.id));

    try {
      await deleteTask(selectedBoardId, task.id, token);
      toast("Task deleted", "info");
    } catch (err) {
      setTasks((prev) => dedupeAndSortTasks([...prev, task]));
      toast(err instanceof Error ? err.message : "Failed to delete task", "error");
    }
  }

  async function handleClearColumn(column: BoardColumn) {
    if (!token) return;
    
    // Optimistic clear
    const previousTasks = [...tasks];
    setTasks((prev) => prev.filter((t) => t.column_id !== column.id));
    
    try {
      await clearColumnTasks(column.board_id, column.id, token);
    } catch (err) {
      setTasks(previousTasks);
      toast("Failed to clear column", "error");
    }
  }

  async function handleBreakdown() {
    if (!selectedBoardId || !token || !prompt.trim() || columns.length === 0) {
      toast("Enter a prompt first.", "error");
      return;
    }

    setIsGenerating(true);
    try {
      const createdTasks = await getBreakdown(selectedBoardId, prompt, token);

      // Insert AI tasks at the TOP of the first column
      setTasks((prev) => {
        const firstColumnId = columns[0]?.id;
        if (!firstColumnId) return dedupeAndSortTasks([...prev, ...createdTasks]);
        // Shift existing tasks in first column down
        const shifted = prev.map((t) =>
          t.column_id === firstColumnId ? { ...t, position: t.position + createdTasks.length } : t,
        );
        // Assign positions 0..n-1 to new AI tasks
        const positioned = createdTasks.map((t, i) => ({ ...t, position: i }));
        return dedupeAndSortTasks([...shifted, ...positioned]);
      });
      
      toast(`Generated ${createdTasks.length} tasks!`, "success");
      setPrompt("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to generate tasks.", "error");
    } finally {
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/login");
    }
  }, [authLoading, token, router]);

  if (authLoading || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      {/* Background Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/50 p-6 shadow-2xl backdrop-blur-xl lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M17.5 14v7M14 17.5h7" />
              </svg>
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">
                TaskFlow
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
                {selectedBoard?.name ?? "Board"}
              </h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Real-time sync active
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-[10px] text-slate-300 sm:text-xs">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white sm:h-5 sm:w-5 sm:text-xs">
                  {user?.email?.[0].toUpperCase() ?? "U"}
                </span>
                <span className="max-w-[150px] truncate sm:max-w-none">
                  {user?.email ?? user?.user_id}
                </span>
              </div>
              <button
                onClick={() => void signOut()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                Sign out
              </button>
            </div>

            <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-1.5 sm:flex-row sm:items-center sm:rounded-xl sm:p-1 lg:w-auto">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe a feature to build..."
                className="w-full bg-transparent px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none sm:min-w-[240px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleBreakdown();
                }}
              />
              <button
                onClick={handleBreakdown}
                disabled={isGenerating || !prompt.trim()}
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:rounded-lg sm:py-2"
              >
                {isGenerating ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                ) : (
                  <>
                    <span className="sm:hidden">Generate Tasks</span>
                    <span className="hidden sm:inline">✨ Generate Tasks</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Board */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {columns.map((column) => (
              <ColumnLane
                key={column.id}
                column={column}
                tasks={tasks.filter((t) => t.column_id === column.id)}
                onAddTask={(c) => {
                  setActiveColumn(c);
                  setModalMode("create");
                  setModalOpen(true);
                }}
                onEditTask={(t) => {
                  setActiveTask(t);
                  setModalMode("edit");
                  setModalOpen(true);
                }}
                onDeleteTask={handleDeleteTask}
                onClearColumn={handleClearColumn}
              />
            ))}
          </div>

          {/* Smooth drag ghost rendered in a portal above everything */}
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
            {draggingTask ? (
              <TaskCard
                task={draggingTask}
                onEdit={(_t) => {}}
                onDelete={(_t) => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modal rendered outside board to guarantee z-index above all card menus */}
      <TaskModal
        open={modalOpen}
        mode={modalMode}
        initialTitle={modalMode === "edit" ? activeTask?.title : ""}
        initialDescription={modalMode === "edit" ? (activeTask?.description || "") : ""}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
      />
    </main>
  );
}
