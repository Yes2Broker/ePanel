"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ErrorBanner, Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttDay, AttMonth, AttSummary } from "@/types";
import { cn, formatDate, formatINR, todayISO } from "@/lib/utils";
import { AttPill, DayFlags, STATUS_CODE, STATUS_STYLE, hours } from "@/components/attendance/att-format";
import { DayEdit, EditTarget } from "@/components/attendance/day-edit";

/** "2026-10" ± n months. */
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

/** ‹ October 2026 › — never past this month. */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const max = todayISO().slice(0, 7);
  return (
    <div className="inline-flex items-center rounded-full bg-white shadow-card">
      <button onClick={() => onChange(shiftMonth(month, -1))} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:text-ink" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
      <label className="relative flex h-10 min-w-[8.5rem] items-center justify-center text-sm font-medium text-ink">
        {monthLabel(month)}
        <input type="month" value={month} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Month"
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <button onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= max} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:text-ink disabled:opacity-30" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

const n1 = (v: number) => Number(v.toFixed(1));

/** The month totals: payable days first, then what makes them up. */
export function SummaryGrid({ s, salary }: { s: AttSummary; salary?: AttMonth["salary"] }) {
  const items: [string, string | number, string?][] = [
    ["Present", s.present],
    ["Absent", s.absent, s.missed ? `+ ${s.missed} missed punch` : undefined],
    ["Weekoff", s.weekoff],
    ["Paid leave", s.paidLeave],
    ["Leave", s.leave, "unpaid"],
    ["Comp-off", s.compOff],
    ["Lates", s.lates, s.lates > s.latesCounted ? `${s.lates - s.latesCounted} counted as short` : "first 2 free"],
    ["Late deduction", n1(s.lateDeduction), "days"],
    ["Short days", s.shortDays, `${n1(s.shortDays * 0.5)} days deducted`],
  ];
  return (
    <div className="space-y-2.5">
      <Card className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 p-4">
        <div>
          <p className="text-xs font-medium text-ink-muted">Net payable days</p>
          <p className="text-3xl font-semibold leading-tight text-ink">{n1(s.netPayable)}<span className="text-base font-normal text-ink-faint"> / {s.daysInMonth}</span></p>
          <p className="text-xs text-ink-faint">{s.lastDay ? `Up to ${formatDate(s.lastDay)}` : "No attendance uploaded yet"}</p>
        </div>
        {salary && (
          <div className="text-right">
            <p className="text-xs font-medium text-ink-muted">Salary (Admin only)</p>
            <p className="text-xl font-semibold text-ink">{formatINR(salary.final)}</p>
            <p className="text-xs text-ink-faint">of {formatINR(salary.monthly)} / month</p>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {items.map(([label, value, note]) => (
          <Card key={label} className="min-w-0 p-2.5 sm:p-3">
            <p className="truncate text-[0.6875rem] font-medium text-ink-muted sm:text-xs">{label}</p>
            <p className="text-lg font-semibold text-ink">{value}</p>
            {note && <p className="break-words text-[0.6875rem] leading-tight text-ink-faint">{note}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Calendar({ month, days, onPick }: { month: string; days: AttDay[]; onPick?: (d: AttDay) => void }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const today = todayISO();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <Card className="p-2.5 sm:p-4">
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-[0.6875rem] font-medium text-ink-faint">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const d = byDate.get(date);
          const body = (
            <>
              <span className={cn("text-xs", date === today ? "font-bold text-brand" : "text-ink-muted")}>{Number(date.slice(8))}</span>
              {d ? (
                <span className={cn("mt-0.5 rounded px-1 text-[0.6875rem] font-semibold leading-4", STATUS_STYLE[d.status])}>{STATUS_CODE[d.status]}</span>
              ) : <span className="mt-0.5 text-[0.6875rem] leading-4 text-ink-faint">·</span>}
              {d && (d.lateHalf || d.late || d.shortDay) && (
                <span className={cn("mt-0.5 h-1 w-1 rounded-full", d.lateHalf || d.shortDay ? "bg-status-danger" : "bg-status-warning")} aria-hidden />
              )}
            </>
          );
          const label = d ? `${formatDate(date)}: ${d.status}${d.late ? ", late" : ""}${d.shortDay ? ", short day" : ""}` : formatDate(date);
          return d && onPick ? (
            <button key={date} onClick={() => onPick(d)} aria-label={label} className="flex min-h-12 flex-col items-center rounded-lg py-1 hover:bg-surface">{body}</button>
          ) : (
            <div key={date} aria-label={label} className="flex min-h-12 flex-col items-center rounded-lg py-1">{body}</div>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[0.6875rem] text-ink-faint">
        <span>P Present</span><span>A Absent</span><span>W Weekoff</span><span>PL Paid leave</span><span>L Leave</span><span>CO Comp-off</span><span>MP Missed punch</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-warning" />Late</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-danger" />Late half / Short</span>
      </p>
    </Card>
  );
}

/** One row per day, newest first. */
export function DayList({ days, onPick }: { days: AttDay[]; onPick?: (d: AttDay) => void }) {
  const rows = [...days].reverse();
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-faint">No days yet.</p>;
  return (
    <Card className="divide-y divide-surface-border">
      {rows.map((d) => (
        <div key={d.date} className="flex items-center gap-3 px-3.5 py-2.5 sm:px-4">
          <div className="w-16 shrink-0 text-sm text-ink">{formatDate(d.date, { weekday: true })}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <AttPill status={d.status} />
              <DayFlags d={d} />
            </div>
            <p className="mt-0.5 break-words text-xs text-ink-muted">
              {d.in || d.out ? `${d.in ?? "—"} – ${d.out ?? "—"}${d.minutes != null ? ` · ${hours(d.minutes)} h` : ""}` : ""}
              {(d.in || d.out) && d.note ? " · " : ""}{d.note}
            </p>
          </div>
          {onPick && (
            <button onClick={() => onPick(d)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" aria-label={`Edit ${formatDate(d.date)}`}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </Card>
  );
}

/**
 * A person's month: totals, calendar and day list. `employeeId` null = me.
 * `canEdit` (HR/Admin) opens the day editor from the calendar or list.
 */
export function MonthView({ employeeId, month, canEdit, onMonth }: { employeeId: string | null; month: string; canEdit?: boolean; onMonth: (m: string) => void }) {
  const { data, loading, error, reload } = useApi(() => api.attMonth(employeeId, `${month}-01`), [employeeId, month]);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const pick = canEdit && data ? (d: AttDay) => setEditing({ employeeId: data.employee.id, name: data.employee.name, date: d.date, day: d }) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPicker month={month} onChange={onMonth} />
        <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
          {(["calendar", "list"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium capitalize", view === v ? "bg-ink text-white" : "text-ink-muted")}>{v}</button>
          ))}
        </div>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          {employeeId && <h2 className="break-words text-base font-semibold text-ink">{data.employee.name} <span className="font-normal text-ink-faint">· {data.employee.id}</span></h2>}
          <SummaryGrid s={data.summary} salary={data.salary} />
          {view === "calendar" ? <Calendar month={month} days={data.days} onPick={pick} /> : <DayList days={data.days} onPick={pick} />}
          {canEdit && <p className="text-xs text-ink-faint">Tap a day to change it. Days after the last upload aren&apos;t shown yet.</p>}
        </>
      )}
      <DayEdit target={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}
