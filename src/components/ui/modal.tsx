"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className={cn("relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-card bg-white shadow-card", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-faint hover:bg-surface hover:text-ink-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-surface-border px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand";
