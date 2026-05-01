"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { BoardColumn, Task } from "@/lib/api";
import TaskCard from "./TaskCard";
import { useState } from "react";
import ConfirmModal from "./ConfirmModal";
import { clearColumnTasks } from "@/lib/api";
import { useAuth } from "@/contexts/AuthProvider";

type ColumnLaneProps = {
  column: BoardColumn;
  tasks: Task[];
  onAddTask: (column: BoardColumn) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onClearColumn?: (column: BoardColumn) => void;
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
  onClearColumn,
}: ColumnLaneProps) {
  const { token } = useAuth();
  const [isClearing, setIsClearing] = useState(false);
  
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column },
  });

  const accent = COLUMN_ACCENTS[column.title] ?? DEFAULT_ACCENT;

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[160px] sm:min-h-[320px] flex-col rounded-2xl border bg-gradient-to-b to-transparent p-3 sm:p-4 transition-all duration-200 ${
        isOver
          ? "border-indigo-400/60 bg-indigo-500/5 shadow-[0_0_30px_-5px_rgba(99,102,241,0.15)]"
          : `${accent.border} ${accent.glow}`
      }`}
    >
      <div className="flex items-center justify-between px-2 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold tracking-wide text-slate-100">
            {column.title}
          </h3>
          <span
            className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${accent.badge}`}
          >
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {tasks.length >= 2 && (
            <button
              onClick={() => setIsClearing(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors"
              title="Clear all tasks in column"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onAddTask(column)}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 transition-all hover:bg-slate-800 hover:text-indigo-400 active:scale-95"
          >
            <span className="text-lg font-bold">+</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={isClearing}
        onClose={() => setIsClearing(false)}
        onConfirm={() => {
          if (onClearColumn) {
            onClearColumn(column);
          }
        }}
        title="Clear Column"
        message={`Are you sure you want to delete all ${tasks.length} tasks in "${column.title}"? This action cannot be undone.`}
        confirmText="Clear All"
        isDanger={true}
      />

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
