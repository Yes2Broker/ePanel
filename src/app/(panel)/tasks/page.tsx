"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Clock, Circle, CheckCircle2, ListTodo } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { PriorityPill } from "@/components/ui/pills";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { tasksInitial } from "@/data/tasks";
import { PersonalTask } from "@/types";
import { cn } from "@/lib/utils";

type Filter = "Pending" | "Completed" | "All";

export default function TasksPage() {
  const [tasks, setTasks] = useState<PersonalTask[]>(tasksInitial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalTask | null>(null);
  const [filter, setFilter] = useState<Filter>("Pending");

  const visible = tasks.filter((t) => (filter === "All" ? true : t.status === filter));

  const upsertTask = (data: { title: string; description?: string; priority: PersonalTask["priority"]; dueDate: string }) => {
    if (editing) {
      setTasks(tasks.map((t) => (t.id === editing.id ? { ...t, ...data } : t)));
    } else {
      setTasks([{ id: `T${Date.now()}`, status: "Pending", ...data }, ...tasks]);
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const toggleComplete = (id: string) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: t.status === "Completed" ? "Pending" : "Completed" } : t)));
  };
  const remove = (id: string) => setTasks(tasks.filter((t) => t.id !== id));

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">My Tasks</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Personal reminders — not company-assigned work.</p>
        </div>
        <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Task
        </PrimaryButton>
      </div>

      <div className="flex gap-1.5">
        {(["Pending", "Completed", "All"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", filter === f ? "bg-ink text-white" : "bg-white text-ink-muted shadow-card")}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-surface-border bg-white py-14 text-center">
          <div className="mb-3 rounded-full bg-surface p-3">
            <ListTodo className="h-5 w-5 text-ink-faint" />
          </div>
          <p className="text-sm font-medium text-ink">{filter === "Completed" ? "No completed tasks yet" : "You're all caught up"}</p>
          <p className="mt-1 max-w-xs text-sm text-ink-faint">Add a task to remind yourself about something later.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li key={t.id} className="group flex items-start gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
              <button onClick={() => toggleComplete(t.id)} className="mt-0.5 shrink-0">
                {t.status === "Completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-status-success" />
                ) : (
                  <Circle className="h-5 w-5 text-ink-faint hover:text-ink-muted" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium text-ink", t.status === "Completed" && "text-ink-faint line-through")}>{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}
                <div className="mt-1.5 flex items-center gap-2">
                  <PriorityPill priority={t.priority} />
                  {t.dueDate && <span className="flex items-center gap-1 text-xs text-ink-faint"><Clock className="h-3 w-3" /> {t.dueDate}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => { setEditing(t); setDialogOpen(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(t.id)} className="rounded-lg p-1.5 text-ink-faint hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TaskDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={upsertTask} initial={editing} />
    </div>
  );
}
