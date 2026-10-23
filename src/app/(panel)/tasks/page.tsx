"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Clock, Circle, CheckCircle2, ListTodo } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { PriorityPill } from "@/components/ui/pills";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { TaskDialog, TaskFormData } from "@/components/tasks/task-dialog";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { PersonalTask } from "@/types";
import { cn, formatDate, todayISO } from "@/lib/utils";

type Filter = "Pending" | "Completed" | "All";

export default function TasksPage() {
  const { permissions } = useSession();
  const toast = useToast();
  const { data: tasks, setData: setTasks, loading, error, reload } = useApi(
    () => (permissions?.tasks ? api.listTasks() : Promise.resolve([])),
    [permissions?.tasks]
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("Pending");

  if (permissions && !permissions.tasks) {
    return (
      <div className="space-y-5 pt-4">
        <PageHeader title="My Tasks" />
        <EmptyState icon={ListTodo} title="Tasks aren't enabled for you" text="Contact HR or Admin if you think this is a mistake." />
      </div>
    );
  }

  const list = tasks ?? [];
  const visible = list.filter((t) => (filter === "All" ? true : t.status === filter));
  const today = todayISO();

  const upsertTask = async (data: TaskFormData) => {
    setSaving(true);
    try {
      const saved = await api.saveTask(editing?.id ?? null, data);
      setTasks(editing ? list.map((t) => (t.id === saved.id ? saved : t)) : [saved, ...list]);
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task: PersonalTask) => {
    const next = task.status === "Completed" ? "Pending" : "Completed";
    setTasks(list.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await api.setTaskStatus(task.id, next);
    } catch (err) {
      setTasks(list); // roll back
      toast(errorMessage(err), "error");
    }
  };

  const remove = async (task: PersonalTask) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await api.deleteTask(task.id);
      setTasks(list.filter((t) => t.id !== task.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-5 pt-4">
      <PageHeader
        title="My Tasks"
        subtitle="Personal reminders — only you can see these."
        actions={<PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Task</PrimaryButton>}
      />

      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "Pending", label: "Pending", count: list.filter((t) => t.status === "Pending").length },
          { value: "Completed", label: "Completed" },
          { value: "All", label: "All" },
        ]}
      />

      <ErrorBanner message={error} onRetry={reload} />

      {loading && !tasks ? <Loading /> : visible.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={filter === "Completed" ? "No completed tasks yet" : "You're all caught up"}
          text="Add a task to remind yourself about something later."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => {
            const overdue = t.status === "Pending" && !!t.dueDate && t.dueDate < today;
            return (
              <li key={t.id} className="group flex items-start gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
                <button onClick={() => toggleComplete(t)} className="mt-0.5 shrink-0" aria-label={t.status === "Completed" ? "Mark as pending" : "Mark as completed"}>
                  {t.status === "Completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-status-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-ink-faint hover:text-ink-muted" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium text-ink", t.status === "Completed" && "text-ink-faint line-through")}>{t.title}</p>
                  {t.description && <p className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">{t.description}</p>}
                  <div className="mt-1.5 flex items-center gap-2">
                    <PriorityPill priority={t.priority} />
                    {t.dueDate && (
                      <span className={cn("flex items-center gap-1 text-xs", overdue ? "font-medium text-status-danger" : "text-ink-faint")}>
                        <Clock className="h-3 w-3" /> {overdue ? "Overdue · " : ""}{formatDate(t.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button onClick={() => { setEditing(t); setDialogOpen(true); }} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted" aria-label="Edit task"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-ink-faint hover:bg-status-dangerBg hover:text-status-danger" aria-label="Delete task"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TaskDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} onSave={upsertTask} initial={editing} saving={saving} />
    </div>
  );
}
