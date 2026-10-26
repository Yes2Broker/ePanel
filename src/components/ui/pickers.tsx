"use client";

/**
 * The panel's own Select, DatePicker, MonthField, TimeSelect and TimeInput —
 * used everywhere instead of the browser's native pickers. On desktop the
 * list / calendar floats under the field; on phones it opens as a bottom sheet.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Search, X } from "lucide-react";
import { cn, todayISO } from "@/lib/utils";

type Variant = "pill" | "field";

/** Same look as the old `selectCls` (filters) and `inputCls` (forms). */
const triggerCls = (variant: Variant, invalid?: boolean) => cn(
  "inline-flex max-w-full items-center justify-between gap-2 border bg-white text-left focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60",
  variant === "pill"
    ? "min-h-10 rounded-pill px-3.5 py-2 text-base text-ink-muted sm:text-sm"
    : "min-h-11 w-full rounded-xl px-3.5 py-2.5 text-base text-ink sm:text-sm",
  invalid ? "border-status-danger" : "border-surface-border",
);

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

// ---------------------------------------------------------------------------
// Popover: floats under the trigger (portal, so modals don't clip it) or, on
// phones, a bottom sheet. Closes on outside click and Escape (Escape doesn't
// reach a modal underneath).
// ---------------------------------------------------------------------------
function usePopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); triggerRef.current?.focus(); }, []);
  return { open, setOpen, close, triggerRef };
}

export function Popover({ open, onClose, anchor, title, children, width }: {
  open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement>; title: string; children: React.ReactNode; width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const p = isPhone();
    setPhone(p);
    if (p) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const h = panel.current?.offsetHeight ?? 320;
      const w = Math.max(width ?? 0, r.width);
      const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
      setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8), minWidth: w, up });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;
  if (phone) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-ink/40" />
        <div ref={panel} className="relative w-full rounded-t-card bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
          <div className="flex items-center justify-between border-b border-surface-border py-1.5 pl-5 pr-2">
            <p className="text-base font-semibold text-ink">{title}</p>
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain p-2">{children}</div>
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={panel} role="dialog" aria-label={title}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: pos?.minWidth }}
      className="fixed z-[60] max-w-[calc(100vw-1rem)] rounded-card border border-surface-border bg-white p-1.5 shadow-lg">
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------
export interface SelectOption { value: string; label: string; disabled?: boolean; hint?: string }

export function Select({
  value, onChange, options, placeholder = "Select…", ariaLabel, variant = "pill", disabled, invalid, className, title,
}: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; placeholder?: string; ariaLabel?: string;
  variant?: Variant; disabled?: boolean; invalid?: boolean; className?: string; title?: string;
}) {
  const { open, setOpen, close, triggerRef } = usePopover();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const searchable = options.length > 8;
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    requestAnimationFrame(() => (searchable && !isPhone() ? searchRef.current : listRef.current)?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const pick = (o: SelectOption | undefined) => { if (!o || o.disabled) return; onChange(o.value); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Tab") close();
  };

  return (
    <>
      <button ref={triggerRef} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        aria-label={ariaLabel} title={title} disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOpen(true); } }}
        className={cn(triggerCls(variant, invalid), className)}>
        <span className={cn("min-w-0 truncate", !selected && "text-ink-faint")}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-faint transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={triggerRef} title={ariaLabel ?? placeholder}>
        {searchable && (
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input ref={searchRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Search…" aria-label="Search options"
              className="min-h-10 w-full rounded-xl border border-surface-border bg-white py-2 pl-9 pr-3 text-base text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm" />
          </div>
        )}
        <ul ref={listRef} id={id} role="listbox" aria-label={ariaLabel} tabIndex={-1} onKeyDown={onKey}
          className="max-h-72 overflow-y-auto focus:outline-none sm:max-h-64">
          {shown.map((o, i) => (
            <li key={o.value} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm sm:min-h-9",
                i === active && "bg-surface", o.value === value ? "font-medium text-ink" : "text-ink-muted", o.disabled && "cursor-not-allowed opacity-40")}>
              <span className="min-w-0 flex-1 break-words">
                {o.label}
                {o.hint && <span className="block text-xs font-normal text-ink-faint">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />}
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-ink-faint">No matches</li>}
        </ul>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Calendar pieces
// ---------------------------------------------------------------------------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "2026-10-26" → "26 Oct 2026". */
export function shortDate(v: string) {
  if (!v) return "";
  const [y, m, d] = v.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function CalendarGrid({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (v: string) => void }) {
  const today = todayISO();
  const start = value || (max && max < today ? max : today);
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const shift = (n: number) => setView((v) => { const d = new Date(Date.UTC(v.y, v.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const prevOk = !min || iso(view.y, view.m, 1) > min;
  const nextOk = !max || iso(view.y, view.m, count) < max;
  return (
    <div className="w-full p-1 sm:w-[17rem]">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!prevOk} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-sm font-semibold text-ink">{MONTHS[view.m]} {view.y}</p>
        <button type="button" onClick={() => shift(1)} disabled={!nextOk} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEK.map((w) => <div key={w} className="py-1 text-[0.6875rem] font-medium text-ink-faint">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const v = iso(view.y, view.m, d);
          const off = (min && v < min) || (max && v > max);
          return (
            <button key={v} type="button" disabled={!!off} onClick={() => onPick(v)} aria-label={shortDate(v)} aria-pressed={v === value}
              className={cn("mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm sm:h-9 sm:w-9",
                v === value ? "bg-ink font-semibold text-white" : v === today ? "font-semibold text-brand ring-1 ring-brand" : "text-ink hover:bg-surface",
                off && "pointer-events-none opacity-30")}>
              {d}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-end">
        {(!min || today >= min) && (!max || today <= max) && (
          <button type="button" onClick={() => onPick(today)} className="min-h-9 rounded-full px-3 text-xs font-medium text-brand hover:bg-brand-soft">Today</button>
        )}
      </div>
    </div>
  );
}

/** Date field → small calendar. Value "YYYY-MM-DD" ("" = none). */
export function DatePicker({
  value, onChange, min, max, ariaLabel, placeholder = "Pick a date", variant = "pill", disabled, invalid, className,
}: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; ariaLabel?: string; placeholder?: string;
  variant?: Variant; disabled?: boolean; invalid?: boolean; className?: string;
}) {
  const { open, setOpen, close, triggerRef } = usePopover();
  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}${value ? `: ${shortDate(value)}` : ""}` : undefined}
        disabled={disabled} onClick={() => setOpen((o) => !o)} className={cn(triggerCls(variant, invalid), className)}>
        <span className={cn("min-w-0 truncate", !value && "text-ink-faint")}>{value ? shortDate(value) : placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </button>
      <Popover open={open} onClose={close} anchor={triggerRef} title={ariaLabel ?? placeholder}>
        <CalendarGrid value={value} min={min} max={max} onPick={(v) => { onChange(v); close(); }} />
      </Popover>
    </>
  );
}

/** Month field → year with arrows + 12 months. Value "YYYY-MM". */
export function MonthField({
  value, onChange, min, max, ariaLabel = "Month", variant = "pill", className, label,
}: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; ariaLabel?: string; variant?: Variant; className?: string;
  /** Custom trigger text (defaults to "October 2026"). */ label?: React.ReactNode;
}) {
  const { open, setOpen, close, triggerRef } = usePopover();
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  useEffect(() => { if (open) setYear(Number(value.slice(0, 4))); }, [open, value]);
  const thisMonth = todayISO().slice(0, 7);
  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={`${ariaLabel}: ${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`}
        onClick={() => setOpen((o) => !o)} className={cn(label ? "" : triggerCls(variant), className)}>
        {label ?? <><span className="truncate">{MONTHS[Number(value.slice(5, 7)) - 1]} {value.slice(0, 4)}</span><CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden /></>}
      </button>
      <Popover open={open} onClose={close} anchor={triggerRef} title={ariaLabel}>
        <div className="w-full p-1 sm:w-[16rem]">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => setYear((y) => y - 1)} disabled={!!min && `${year - 1}-12` < min} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold text-ink">{year}</p>
            <button type="button" onClick={() => setYear((y) => y + 1)} disabled={!!max && `${year + 1}-01` > max} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface disabled:opacity-30" aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const v = `${year}-${String(i + 1).padStart(2, "0")}`;
              const off = (min && v < min) || (max && v > max);
              return (
                <button key={v} type="button" disabled={!!off} aria-pressed={v === value} onClick={() => { onChange(v); close(); }}
                  className={cn("min-h-11 rounded-full text-sm sm:min-h-10", v === value ? "bg-ink font-semibold text-white" : v === thisMonth ? "font-semibold text-brand ring-1 ring-brand" : "text-ink hover:bg-surface", off && "pointer-events-none opacity-30")}>
                  {m.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------
/** "21:30" → "9:30 PM". */
export function timeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Pick a time from a list in 30-minute steps. Value "HH:MM". */
export function TimeSelect({ value, onChange, ariaLabel, variant = "pill", disabled, min, max, className }: {
  value: string; onChange: (v: string) => void; ariaLabel?: string; variant?: Variant; disabled?: boolean; min?: string; max?: string; className?: string;
}) {
  const options = useMemo(() => Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`)
    .filter((t) => (!min || t >= min) && (!max || t <= max)).map((t) => ({ value: t, label: timeLabel(t) })), [min, max]);
  return <Select value={value} onChange={onChange} options={options} ariaLabel={ariaLabel} variant={variant} disabled={disabled} className={className} placeholder="Pick a time" />;
}

/**
 * Exact time typed as HH:MM (24-hour), e.g. attendance In/Out. Digits only;
 * the colon is added automatically. Out-of-range values are flagged.
 */
export function TimeInput({ value, onChange, ariaLabel, disabled, max, className }: {
  value: string; onChange: (v: string) => void; ariaLabel?: string; disabled?: boolean; max?: string; className?: string;
}) {
  const valid = !value || (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) && (!max || value <= max));
  const format = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  };
  return (
    <div className={cn("relative", className)}>
      <input value={value} inputMode="numeric" autoComplete="off" placeholder="HH:MM" maxLength={5} aria-label={ariaLabel} aria-invalid={!valid} disabled={disabled}
        onChange={(e) => onChange(format(e.target.value))}
        className={cn("min-h-11 w-full rounded-xl border bg-white py-2.5 pl-3.5 pr-9 text-base tabular-nums text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60 sm:text-sm",
          valid ? "border-surface-border" : "border-status-danger")} />
      <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
    </div>
  );
}
