"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { BoardColumn, Task } from "@/lib/api";
import TaskCard from "./TaskCard";

type ColumnLaneProps = {
  column: BoardColumn;
  tasks: Task[];
  onAddTask: (column: BoardColumn) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
};

const COLUMN_ACCENTS: Record<string, { border: string; glow: string; badge: string }> = {
  "To Do": {
    border: "border-slate-600/40",
    glow: "from-slate-500/10",
    badge: "bg-slate-700/60 text-slate-300",
  },
  "In Progress": {
    border: "border-amber-500/30",
    glow: "from-amber-500/10",
    badge: "bg-amber-900/40 text-amber-300",
  },
  Done: {
    border: "border-emerald-500/30",
    glow: "from-emerald-500/10",
    badge: "bg-emerald-900/40 text-emerald-300",
  },
};

const DEFAULT_ACCENT = {
  border: "border-indigo-500/30",
  glow: "from-indigo-500/10",
  badge: "bg-indigo-900/40 text-indigo-300",
};

export default function ColumnLane({
  column,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
}: ColumnLaneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column },
  });

  const accent = COLUMN_ACCENTS[column.title] ?? DEFAULT_ACCENT;

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[320px] flex-col rounded-2xl border bg-gradient-to-b to-transparent p-4 transition-all duration-200 ${
        isOver
          ? "border-indigo-400/60 bg-indigo-500/5 shadow-[0_0_30px_-5px_rgba(99,102,241,0.15)]"
          : `${accent.border} ${accent.glow}`
      }`}
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-300">
            {column.title}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${accent.badge}`}
          >
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAddTask(column)}
          className="rounded-lg border border-slate-700/50 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:border-indigo-500/50 hover:bg-indigo-600/20 hover:text-indigo-300"
        >
          + Add
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-2.5">
        {/* Drop indicator at top when dragging over an empty area */}
        {isOver && tasks.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-indigo-500/50 py-6 transition-all" />
        )}

        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !isOver && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-700/40 py-8">
            <p className="text-xs text-slate-500">Drop tasks here</p>
          </div>
        )}
      </div>
    </section>
  );
}
