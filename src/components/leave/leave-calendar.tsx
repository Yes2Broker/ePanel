"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ErrorBanner, Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { LeaveCalendarDay } from "@/types";
import { cn, formatDate, todayISO } from "@/lib/utils";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const isoDow = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const firstName = (n: string) => n.split(" ")[0];

function Entry({ l }: { l: LeaveCalendarDay["leaves"][number] }) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
      l.status === "Pending" ? "border border-dashed border-status-warning text-status-warning"
        : l.kind === "Comp-off" ? "bg-brand-soft text-brand" : "bg-status-dangerBg text-status-danger")}
      title={`${l.name} · ${l.kind}${l.half ? ` (${l.half} half)` : ""} · ${l.status}`}>
      <span className="truncate">{firstName(l.name)}{l.portion < 1 ? " ½" : ""}</span>
    </span>
  );
}

/** Month view for HR/Admin: who's off each day, holidays and weekly offs. */
export function LeaveCalendar() {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, loading, error, reload } = useApi(() => api.leaveCalendar(`${month}-01`), [month]);
  const days = data?.days ?? [];
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
  const lead = days.length ? isoDow(days[0].date) - 1 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <p className="min-w-[9rem] text-center text-sm font-semibold text-ink">{label}</p>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-status-danger" /> Leave</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Comp-off</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-status-warning" /> Pending</span>
        <span>½ = half day</span>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          {/* Phones: one row per day that has something on it. */}
          <ul className="space-y-1.5 md:hidden">
            {days.filter((d) => d.holiday || d.leaves.length || d.weeklyOff.length).map((d) => (
              <li key={d.date}>
                <Card className={cn("p-3", d.date === today && "ring-2 ring-brand")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{formatDate(d.date, { weekday: true })}</p>
                    {d.holiday && <span className="break-words text-right text-xs font-medium text-brand">{d.holiday}</span>}
                  </div>
                  {d.leaves.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{d.leaves.map((l) => <Entry key={l.id} l={l} />)}</div>}
                  {d.weeklyOff.length > 0 && <p className="mt-1 break-words text-xs text-ink-faint">Weekly off: {d.weeklyOff.map(firstName).join(", ")}</p>}
                </Card>
              </li>
            ))}
          </ul>

          {/* Tablet / desktop: the month grid. */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="grid grid-cols-7 border-b border-surface-border bg-surface text-center text-xs font-medium text-ink-faint">
              {WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} className="min-h-28 border-b border-r border-surface-border bg-surface/50" />)}
              {days.map((d) => (
                <div key={d.date} className={cn("min-h-28 min-w-0 space-y-1 border-b border-r border-surface-border p-1.5", d.holiday && "bg-brand-soft/60", d.date === today && "ring-2 ring-inset ring-brand")}>
                  <p className="flex items-baseline justify-between gap-1 text-xs">
                    <span className="font-semibold text-ink">{Number(d.date.slice(8))}</span>
                    {d.holiday && <span className="truncate text-[0.6875rem] font-medium text-brand" title={d.holiday}>{d.holiday}</span>}
                  </p>
                  <div className="flex flex-wrap gap-0.5">{d.leaves.map((l) => <Entry key={l.id} l={l} />)}</div>
                  {d.weeklyOff.length > 0 && (
                    <p className="truncate text-[0.6875rem] text-ink-faint" title={`Weekly off: ${d.weeklyOff.join(", ")}`}>Off: {d.weeklyOff.map(firstName).join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
