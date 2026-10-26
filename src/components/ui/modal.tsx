"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Open popups, oldest first: only the top one reacts to Escape, and the page
// behind stays locked until the last one closes.
const stack: symbol[] = [];

function useModalStack(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol("modal");
    stack.push(id);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      if (!stack.length) document.body.style.overflow = "";
    };
  }, [open]);
}

/**
 * Popup. Phones: a bottom sheet that can grow to the full screen height.
 * Larger screens: a centred dialog, or with `panel` a full-height panel on the
 * right (the page stays visible beside it). The header (with the close button)
 * and the optional footer stay put while the body scrolls.
 */
export function Modal({
  open, onClose, title, subtitle, children, footer, wide, size = "md", bodyClassName, panel,
}: {
  open: boolean; onClose: () => void; title: string; subtitle?: React.ReactNode; children: React.ReactNode;
  footer?: React.ReactNode; wide?: boolean; size?: "sm" | "md" | "lg"; bodyClassName?: string; panel?: boolean;
}) {
  useModalStack(open, onClose);
  if (!open) return null;
  const width = wide || size === "lg" ? "sm:max-w-2xl" : size === "sm" ? "sm:max-w-[400px]" : "sm:max-w-md";
  return (
    // !mt-0: a parent's space-y-* margin must not shift a fixed popup down.
    <div className={cn("fixed inset-0 z-50 !mt-0 flex items-end justify-center", panel ? "sm:items-stretch sm:justify-end" : "sm:items-center sm:p-4")} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn("absolute inset-0", panel ? "bg-ink/40 sm:bg-ink/20" : "bg-ink/40")} onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-sheet w-full flex-col overflow-hidden rounded-t-card bg-white shadow-lg",
          panel ? "sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-none" : cn("sm:max-h-[90vh] sm:rounded-card", width)
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border py-2 pl-5 pr-2">
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold leading-snug text-ink sm:text-sm">{title}</h3>
            {subtitle && <p className="break-words text-xs text-ink-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-5", !footer && "pb-[max(1.25rem,env(safe-area-inset-bottom))]", bodyClassName)}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-surface-border bg-white px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
        )}
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

// text-base on phones stops iOS Safari zooming in when a field is focused.
export const inputCls =
  "min-h-11 w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm";
