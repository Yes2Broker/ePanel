"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** The 18px rounded-square box. White with a grey border; checked = dark ink with a white tick. */
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
      checked ? "border-ink bg-ink text-white" : "border-surface-border bg-white")}>
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/** A whole clickable row: box + label (+ small muted note on the right). For multi-select lists. */
export function CheckRow({ checked, onChange, label, note, disabled, className }: {
  checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; note?: React.ReactNode; disabled?: boolean; className?: string;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-ink/25 bg-ink/[0.04] text-ink" : "border-surface-border bg-white text-ink-muted hover:bg-surface", className)}>
      <CheckBox checked={checked} />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {note && <span className="shrink-0 text-xs text-ink-faint">{note}</span>}
    </button>
  );
}
