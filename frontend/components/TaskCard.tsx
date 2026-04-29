"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";

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

  const [isDeleting, setIsDeleting] = useState(false);

  const isAiGenerated =
    typeof task.description === "string" && task.description.length > 30;

  return (
    <>
      <article
        ref={setNodeRef}
        onMouseLeave={() => setShowMenu(false)}
        style={{
          transform: CSS.Translate.toString(transform),
          transition,
          opacity: isDragging ? 0 : 1,
          touchAction: "none",
        }}
        className={`group relative rounded-xl border border-slate-700/50 bg-slate-800/60 p-3.5 text-sm shadow-sm backdrop-blur transition-all hover:border-slate-600/70 hover:bg-slate-800/80 ${
          showMenu ? "z-30 ring-1 ring-slate-500/30" : "z-0"
        } ${
          isOverlay ? "rotate-1 scale-105 shadow-2xl shadow-black/50 ring-1 ring-indigo-500/40 z-[1001]" : ""
        }`}
        {...listeners}
        {...attributes}
      >
        {/* Drag handle cursor hint */}
        <div className="absolute inset-0 cursor-grab rounded-xl active:cursor-grabbing" />

        {/* Action menu button */}
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit(task);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Edit Task
                </button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setIsDeleting(true);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Delete Task
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* Metadata row (AI Badge + Date) */}
          <div className="flex items-center gap-2">
            {isAiGenerated && (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-400 ring-1 ring-indigo-500/20">
                ✨ AI
              </span>
            )}
            <span suppressHydrationWarning className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">
              {isAiGenerated && "—"} {new Date(task.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>

          <h4 className="font-bold leading-tight text-slate-100 line-clamp-2">
            {task.title}
          </h4>
          
          <p className="text-xs leading-relaxed text-slate-400 line-clamp-3">
            {task.description}
          </p>
        </div>
      </article>

      <ConfirmModal
        isOpen={isDeleting}
        onClose={() => setIsDeleting(false)}
        onConfirm={() => onDelete(task)}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        isDanger={true}
      />
    </>
  );
}
