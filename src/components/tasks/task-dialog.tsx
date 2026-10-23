"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { PersonalTask, TaskPriority } from "@/types";

export interface TaskFormData {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
}

export function TaskDialog({
  open, onClose, onSave, initial, saving,
}: { open: boolean; onClose: () => void; onSave: (data: TaskFormData) => void; initial: PersonalTask | null; saving?: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || "");
      setDescription(initial?.description || "");
      setPriority(initial?.priority || "Medium");
      setDueDate(initial?.dueDate || "");
    }
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit Task" : "Add Task"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onSave({ title: title.trim(), description, priority, dueDate });
        }}
        className="space-y-4"
      >
        <Field label="Task">
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call Rahul regarding Ahmedabad project" className={inputCls} />
        </Field>
        <Field label="Description (optional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={inputCls}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </Field>
          <Field label="Due Date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Add task"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
