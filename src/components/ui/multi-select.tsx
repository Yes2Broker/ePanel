"use client";

import { useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Popover } from "@/components/ui/pickers";
import { CheckBox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Panel-style multi-select: a pill showing "Locality (3)", opening a list of
 * checkboxes with a search box (long lists) and Clear. Phones get a sheet.
 */
export function MultiSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const shown = options.filter((o) => !q || o.toLowerCase().includes(q.toLowerCase()));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <>
      <button ref={btn} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}${value.length ? ` (${value.length})` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-pill border bg-white px-3.5 text-sm",
          value.length ? "border-brand font-medium text-brand" : "border-surface-border text-ink")}>
        {label}{value.length > 0 && ` (${value.length})`}
        <ChevronDown className="h-4 w-4 text-ink-faint" aria-hidden />
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setQ(""); }} anchor={btn} title={label} width={240}>
        <div className="w-full sm:w-60">
          {options.length > 7 && (
            <label className="relative mb-1 block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label}`}
                className="min-h-10 w-full rounded-lg border border-surface-border pl-8 pr-2 text-base focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm" />
            </label>
          )}
          <ul role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-72 overflow-y-auto">
            {shown.map((o) => (
              <li key={o} role="option" aria-selected={value.includes(o)}>
                <button type="button" onClick={() => toggle(o)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-ink hover:bg-surface sm:min-h-10">
                  <CheckBox checked={value.includes(o)} /> {o}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-2.5 py-2 text-sm text-ink-muted">Nothing here.</li>}
          </ul>
          {value.length > 0 && (
            <div className="mt-1 border-t border-surface-border pt-1">
              <button type="button" onClick={() => onChange([])} className="min-h-10 w-full rounded-lg px-2.5 text-left text-sm font-medium text-ink-muted hover:bg-surface">Clear</button>
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
