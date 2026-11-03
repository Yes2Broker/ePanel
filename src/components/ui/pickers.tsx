"use client";

/**
 * The panel's own Select, DatePicker, MonthField and TimePicker (TimeSelect /
 * TimeInput wrap it) —
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

export function Popover({ open, onClose, anchor, title, children, width, fit }: {
  open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement>; title: string; children: React.ReactNode; width?: number;
  /** Size to the content (not the field's width), still aligned to the field and kept on screen. */ fit?: boolean;
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
      const w = fit ? (panel.current?.offsetWidth ?? 280) : Math.max(width ?? 0, r.width);
      const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
      setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8), minWidth: fit ? 0 : w, up });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, anchor, width, fit]);

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

/** Display for any stored time ("19:00" or "19:00:00") → "7:00 PM"; empty → "—". */
export function time12(t: string | null | undefined) {
  return t && /^\d{1,2}:\d{2}/.test(t) ? timeLabel(t) : "—";
}

/**
 * Typed time → 24-hour "HH:MM", or null if it isn't a time. Accepts "1030",
 * "10:30", "10.30", "10:30 pm", "7pm", "7", "19:00".
 */
export function parseTimeText(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.[0];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const nowHHMM = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

/**
 * The panel's time picker: shows "10:30 AM" (12-hour), saves 24-hour "HH:MM".
 * Type straight into it ("1030", "7pm"…) or open the popup: Hour / Minute /
 * AM-PM columns (↑/↓ work), scrolled to the value (or to now when empty),
 * Clear and Done. Phones get a sheet.
 */
export function TimePicker({ value, onChange, ariaLabel, variant = "field", disabled, min, max, placeholder = "Pick a time", className }: {
  value: string; onChange: (v: string) => void; ariaLabel?: string; variant?: Variant; disabled?: boolean;
  min?: string; max?: string; placeholder?: string; className?: string;
}) {
  // Read-only: the whole box opens the popup (click, tap, Enter, Space); no typing.
  const { open, setOpen, close, triggerRef } = usePopover();
  const inRange = (t: string) => (!min || t >= min) && (!max || t <= max);
  const valid = !value || (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) && inRange(value));
  return (
    <>
      <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-invalid={!valid}
        aria-label={ariaLabel ? `${ariaLabel}${value ? `: ${time12(value)}` : ""}` : undefined} data-value={value}
        onClick={() => setOpen((o) => !o)}
        className={cn(triggerCls(variant, !valid), "tabular-nums", variant === "pill" && "min-w-[8.5rem]", className)}>
        <span className={cn("min-w-0 truncate", !value && "text-ink-faint")}>{value ? time12(value) : placeholder}</span>
        <Clock className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </button>
      {open && <TimePanel anchor={triggerRef} value={value} inRange={inRange} min={min} max={max} title={ariaLabel ?? "Pick a time"}
        onClose={close} onPick={(t) => { onChange(t); close(); }} />}
    </>
  );
}

function TimePanel({ anchor, value, inRange, min, max, title, onClose, onPick }: {
  anchor: React.RefObject<HTMLElement>; value: string; inRange: (t: string) => boolean; min?: string; max?: string; title: string;
  onClose: () => void; onPick: (t: string) => void;
}) {
  // Start at the value, or (empty) at now — highlighted, not filled in until Done.
  const start = /^\d{2}:\d{2}/.test(value) ? value : (() => {
    const [h, mm] = nowHHMM().split(":").map(Number);
    // Round DOWN to 5 minutes (5:53 → 5:50), never later than allowed.
    let r = Math.floor((h * 60 + mm) / 5) * 5;
    if (max) r = Math.min(r, Math.floor((Number(max.slice(0, 2)) * 60 + Number(max.slice(3, 5))) / 5) * 5);
    return `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
  })();
  const [h24, setH24] = useState(Number(start.slice(0, 2)));
  const [m, setM] = useState(Number(start.slice(3, 5)));
  const [custom, setCustom] = useState(!MINUTES.includes(Number(start.slice(3, 5))));
  const h12 = ((h24 + 11) % 12) + 1, pm = h24 >= 12;
  const setHour12 = (h: number) => setH24((h % 12) + (pm ? 12 : 0));
  const out = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ok = inRange(out);
  // Scroll the Hour / Minute columns to the highlighted time when the popup opens.
  const cols = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => cols.current?.querySelectorAll<HTMLElement>("[data-on=true]").forEach((el) => {
      const box = el.parentElement!;
      box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    }), 0);
    return () => clearTimeout(t);
  }, []);
  const big = "min-h-11 sm:min-h-9";
  const cell = (on: boolean) => cn("w-full rounded-lg px-2 text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-30", big, on ? "bg-ink font-semibold text-white" : "text-ink hover:bg-surface");
  // Times outside min / max can't be picked.
  const at = (h: number, mm: number) => `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const hourOff = (h: number, isPm = pm) => { const x = (h % 12) + (isPm ? 12 : 0); return MINUTES.every((mm) => !inRange(at(x, mm))); };
  const minuteOff = (mm: number) => !inRange(at(h24, mm));
  const halfOff = (isPm: boolean) => Array.from({ length: 12 }, (_, i) => i + 1).every((h) => hourOff(h, isPm));
  const keys = (e: React.KeyboardEvent, step: (d: number) => void) => {
    if (e.key === "ArrowUp") { e.preventDefault(); step(-1); } else if (e.key === "ArrowDown") { e.preventDefault(); step(1); } else if (e.key === "Enter" && ok) { e.preventDefault(); onPick(out); }
  };
  return (
    <Popover open onClose={onClose} anchor={anchor} title={title} fit>
      <div className="w-full space-y-2.5 p-1.5 sm:w-[264px]">
        <div ref={cols} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <div className="relative max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-surface-border p-1 focus:outline-none focus:ring-2 focus:ring-brand" tabIndex={0} aria-label="Hour"
            onKeyDown={(e) => keys(e, (d) => setHour12(((h12 - 1 + d + 12) % 12) + 1))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <button key={h} type="button" data-on={h === h12} disabled={hourOff(h)} onClick={() => setHour12(h)} className={cell(h === h12)}>{h}</button>)}
          </div>
          <div className="relative max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-surface-border p-1 focus:outline-none focus:ring-2 focus:ring-brand" tabIndex={0} aria-label="Minute"
            onKeyDown={(e) => keys(e, (d) => { setCustom(false); setM((x) => (Math.round(x / 5) * 5 + d * 5 + 60) % 60); })}>
            {MINUTES.map((x) => <button key={x} type="button" data-on={!custom && x === m} disabled={minuteOff(x)} onClick={() => { setM(x); setCustom(false); }} className={cell(!custom && x === m)}>{String(x).padStart(2, "0")}</button>)}
            {custom
              ? <input autoFocus inputMode="numeric" aria-label="Custom minute" value={String(m)} maxLength={2}
                  onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "") || 0); if (v <= 59) setM(v); }}
                  className={cn("w-full rounded-lg border border-brand px-2 text-center text-sm tabular-nums focus:outline-none", big)} />
              : <button type="button" onClick={() => setCustom(true)} className={cn("w-full rounded-lg px-2 text-xs text-ink-muted hover:bg-surface", big)}>custom</button>}
          </div>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="AM or PM">
            {["AM", "PM"].map((x) => (
              <button key={x} type="button" role="radio" aria-checked={(x === "PM") === pm} disabled={halfOff(x === "PM")} onClick={() => setH24((h24 % 12) + (x === "PM" ? 12 : 0))}
                className={cn("rounded-lg border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-30", big, (x === "PM") === pm ? "border-ink bg-ink font-semibold text-white" : "border-surface-border text-ink hover:bg-surface")}>{x}</button>
            ))}
          </div>
        </div>
        {!ok && <p className="text-xs text-status-danger">Pick a time {min && max ? `between ${timeLabel(min)} and ${timeLabel(max)}` : max ? `up to ${timeLabel(max)}` : `from ${timeLabel(min!)}`}.</p>}
        <div className="flex items-center justify-between gap-2 border-t border-surface-border pt-2">
          <button type="button" onClick={() => onPick("")} className={cn("rounded-lg px-3 text-sm text-ink-muted hover:bg-surface", big)}>Clear</button>
          <span className="text-sm font-medium tabular-nums text-ink">{timeLabel(out)}</span>
          <button type="button" disabled={!ok} onClick={() => onPick(out)} className={cn("rounded-lg bg-ink px-4 text-sm font-medium text-white disabled:opacity-40", big)}>Done</button>
        </div>
      </div>
    </Popover>
  );
}

/** Times on a schedule (email / reminders): the same TimePicker, as a pill. */
export function TimeSelect({ value, onChange, ariaLabel, variant = "pill", disabled, min, max, className }: {
  value: string; onChange: (v: string) => void; ariaLabel?: string; variant?: Variant; disabled?: boolean; min?: string; max?: string; className?: string;
}) {
  // A schedule always has a time: Clear keeps the current one.
  return <TimePicker value={value} onChange={(v) => v && onChange(v)} ariaLabel={ariaLabel} variant={variant} disabled={disabled} min={min} max={max} className={className} />;
}

/** Exact times (attendance In/Out, visit times): the same TimePicker, as a form field. */
export function TimeInput({ value, onChange, ariaLabel, disabled, max, className }: {
  value: string; onChange: (v: string) => void; ariaLabel?: string; disabled?: boolean; max?: string; className?: string;
}) {
  return <TimePicker value={value} onChange={onChange} ariaLabel={ariaLabel} disabled={disabled} max={max} className={className} />;
}
