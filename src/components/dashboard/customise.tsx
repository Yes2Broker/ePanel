"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, LayoutDashboard, SlidersHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SecondaryButton, Toggle } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardKind, PRESETS, SECTION_LABELS, presetLayout, resolveLayout } from "@/lib/dashboard-layout";
import { DashboardItem, SavedDashboard } from "@/types";

/**
 * The person's dashboard layout. It comes with the session (no extra call),
 * changes show at once, and are saved to the database a moment later so the
 * same layout follows them to other devices.
 */
export function useDashboardLayout(kind: DashboardKind, available: string[], fallback?: SavedDashboard | null) {
  const { dashboard, setDashboard } = useSession();
  const toast = useToast();
  const { layout, preset } = resolveLayout(kind, available, dashboard, fallback);
  const pending = useRef<SavedDashboard | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const d = pending.current;
    if (d === undefined) return;
    pending.current = undefined;
    api.saveDashboardLayout(d?.layout ?? null, d?.preset ?? null)
      .catch(() => toast("Couldn't save your dashboard layout. Check your connection.", "error"));
  }, [toast]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const save = (d: SavedDashboard | null) => {
    setDashboard(d);
    pending.current = d;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };

  const shown = layout.filter((i) => i.on).map((i) => i.id);
  return {
    layout, preset, shown,
    isShown: (id: string) => shown.includes(id),
    change: (next: DashboardItem[], nextPreset: string) => save({ layout: next, preset: nextPreset }),
    reset: () => save(null),
  };
}

export function CustomiseButton({ onClick }: { onClick: () => void }) {
  return (
    <SecondaryButton onClick={onClick} className="min-h-10 px-3 text-xs sm:text-sm">
      <SlidersHorizontal className="h-4 w-4" /> Customise
    </SecondaryButton>
  );
}

export function DashboardEmpty({ onCustomise }: { onCustomise: () => void }) {
  return (
    <EmptyState icon={LayoutDashboard} title="Your dashboard is empty." text="Choose which cards to show."
      action={<SecondaryButton onClick={onCustomise}><SlidersHorizontal className="h-4 w-4" /> Customise it</SecondaryButton>} />
  );
}

/** Side panel (desktop) / bottom sheet (phone): presets, then every section with show/hide and reorder. */
export function CustomisePanel({ open, onClose, kind, available, layout, preset, onChange, onReset }: {
  open: boolean; onClose: () => void; kind: DashboardKind; available: string[];
  layout: DashboardItem[]; preset: string; onChange: (layout: DashboardItem[], preset: string) => void; onReset: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const presets = PRESETS[kind];
  const labels = SECTION_LABELS[kind];
  const current = presets.find((p) => p.id === preset)?.name ?? "Custom";

  const setOn = (id: string, on: boolean) => onChange(layout.map((i) => (i.id === id ? { ...i, on } : i)), "custom");
  const move = (id: string, to: number) => {
    const from = layout.findIndex((i) => i.id === id);
    if (from < 0 || to < 0 || to >= layout.length || from === to) return;
    const next = [...layout];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next, "custom");
  };

  return (
    <Modal open={open} onClose={onClose} panel title="Customise dashboard" subtitle={`Layout: ${current} · saved automatically`}>
      <div className="space-y-6">
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Presets</h4>
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Presets">
            {presets.map((p) => {
              const active = p.id === preset;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(presetLayout(p, available), p.id)}
                  className={cn("flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    active ? "border-ink bg-ink/[0.04]" : "border-surface-border bg-white hover:bg-surface")}>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", active ? "bg-ink text-white" : "bg-brand-soft text-brand")}>
                    <p.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-faint">{p.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-ink-faint">Custom</h4>
            {preset === "custom" && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">Selected</span>}
          </div>
          <ul className="divide-y divide-surface-border rounded-xl border border-surface-border" aria-label="Dashboard sections">
            {layout.map((item, idx) => (
              <li key={item.id} data-section={item.id}
                onDragOver={(e) => { if (!dragId) return; e.preventDefault(); if (dragId !== item.id) move(dragId, idx); }}
                onDrop={(e) => { e.preventDefault(); setDragId(null); }}
                className={cn("flex min-h-12 items-center gap-2 bg-white px-2 py-1.5 first:rounded-t-xl last:rounded-b-xl", dragId === item.id && "opacity-50")}>
                <span draggable aria-label={`Drag to reorder ${labels[item.id]}`} title="Drag to reorder"
                  onDragStart={(e) => {
                    setDragId(item.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", item.id);
                    const row = e.currentTarget.closest("li");
                    if (row) e.dataTransfer.setDragImage(row, 16, 16);
                  }}
                  onDragEnd={() => setDragId(null)}
                  className="hidden h-9 w-6 shrink-0 cursor-grab items-center justify-center text-ink-faint active:cursor-grabbing sm:flex">
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className={cn("min-w-0 flex-1 break-words text-sm", item.on ? "text-ink" : "text-ink-faint")}>{labels[item.id]}</span>
                <span className="flex shrink-0 sm:hidden">
                  <button type="button" onClick={() => move(item.id, idx - 1)} disabled={idx === 0} aria-label={`Move ${labels[item.id]} up`}
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-ink-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(item.id, idx + 1)} disabled={idx === layout.length - 1} aria-label={`Move ${labels[item.id]} down`}
                    className="flex h-10 w-9 items-center justify-center rounded-lg text-ink-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                </span>
                <span className="flex h-10 w-12 shrink-0 items-center justify-center">
                  <Toggle checked={item.on} onChange={(v) => setOn(item.id, v)} label={`Show ${labels[item.id]}`} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-center">
          <button type="button" onClick={onReset} className="min-h-11 px-3 text-sm font-medium text-ink-muted underline underline-offset-2 hover:text-ink">Reset to default</button>
        </div>
      </div>
    </Modal>
  );
}
