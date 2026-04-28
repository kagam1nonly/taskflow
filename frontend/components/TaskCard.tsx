"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";

import type { Task } from "@/lib/api";

type TaskCardProps = {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** When true the card renders as the DragOverlay ghost — no drag listeners. */
  isOverlay?: boolean;
};

export default function TaskCard({ task, onEdit, onDelete, isOverlay = false }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled: isOverlay,
  });

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Close menu when drag starts
  useEffect(() => {
    if (isDragging) setShowMenu(false);
  }, [isDragging]);

  const isAiGenerated =
    typeof task.description === "string" && task.description.length > 30;

  return (
    <article
      ref={setNodeRef}
      onMouseLeave={() => setShowMenu(false)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
      }}
      className={`group relative rounded-xl border border-slate-700/50 bg-slate-800/60 p-3.5 text-sm shadow-sm backdrop-blur transition-all hover:border-slate-600/70 hover:bg-slate-800/80 ${
        showMenu ? "z-30 ring-1 ring-slate-500/30" : "z-0"
      } ${
        isOverlay ? "rotate-1 scale-105 shadow-2xl shadow-black/50 ring-1 ring-indigo-500/40 z-[1001]" : ""
      }`}
      // Only the whole card body listens for drag — but NOT the action button area
      {...listeners}
      {...attributes}
    >
      {/* Drag handle cursor hint */}
      <div className="absolute inset-0 cursor-grab rounded-xl active:cursor-grabbing" />

      {/* Action menu button — above the drag handle */}
      {!isDragging && !isOverlay && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            ref={menuBtnRef}
            aria-label="Open task menu"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((prev) => !prev);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>

          {showMenu && (
            <div
              ref={menuRef}
              onMouseLeave={() => setShowMenu(false)}
              className="absolute right-0 top-8 z-[200] min-w-[120px] rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit(task);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700"
              >
                <span>✏️</span> Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete(task);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-red-900/30"
              >
                <span>🗑️</span> Delete
              </button>
            </div>
          )}
        </div>
      )}

      {/* Card content */}
      <div className="relative z-[1] pointer-events-none">
        <div className="flex items-start gap-2">
          <h4 className="flex-1 pr-6 font-semibold text-slate-100">{task.title}</h4>
          {isAiGenerated && (
            <span className="mt-0.5 shrink-0 rounded-full bg-indigo-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300 ring-1 ring-indigo-500/30">
              ✨ AI
            </span>
          )}
        </div>
        {task.description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{task.description}</p>
        ) : null}
      </div>
    </article>
  );
}
