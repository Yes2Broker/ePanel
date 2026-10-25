"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CircleCheck, Download, Pencil, Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, selectCls, tableHeadCls } from "@/components/ui/page";
import { inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttDay, AttStatus, AttTeamMonthRow, PersonRef } from "@/types";
import { cn, formatDate, formatINR, todayISO } from "@/lib/utils";
import { ALL_STATUSES, AttPill, DayFlags, hours } from "@/components/attendance/att-format";
import { DayEdit, EditTarget } from "@/components/attendance/day-edit";
import { MonthPicker, MonthView, monthLabel } from "@/components/attendance/month-view";

export type DayFilter = "" | AttStatus | "Late" | "Late Half" | "Short Day";
export const DAY_FILTERS: DayFilter[] = [...ALL_STATUSES, "Late", "Late Half", "Short Day"];

export function matchesFilter(d: AttDay | null, f: DayFilter) {
  if (!f) return true;
  if (!d) return false;
  if (f === "Late") return d.late;
  if (f === "Late Half") return d.lateHalf;
  if (f === "Short Day") return d.shortDay;
  return d.status === f;
}

const n1 = (v: number) => Number(v.toFixed(1));

/** One person-day row, with an edit button. */
function PersonDayRow({ person, day, date, onEdit }: { person: PersonRef; day: AttDay | null; date: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-ink">{person.name} <span className="font-normal text-ink-faint">· {person.id}</span></p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {day ? <AttPill status={day.status} /> : <span className="text-xs text-ink-faint">Not joined yet</span>}
          {day && <DayFlags d={day} />}
        </div>
        {day && (day.in || day.out || day.note) && (
          <p className="mt-0.5 break-words text-xs text-ink-muted">
            {day.in || day.out ? `${day.in ?? "—"} – ${day.out ?? "—"}${day.minutes != null ? ` · ${hours(day.minutes)} h` : ""}` : ""}
            {(day.in || day.out) && day.note ? " · " : ""}{day.note}
          </p>
        )}
      </div>
      <button onClick={onEdit} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" aria-label={`Edit ${person.name}, ${formatDate(date)}`}>
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Everyone on one day, with filters. */
export function TeamDay({ date, filter, onChange }: { date: string; filter: DayFilter; onChange: (date: string, filter: DayFilter) => void }) {
  const { data, loading, error, reload } = useApi(() => api.attTeamDay(date), [date]);
  const [person, setPerson] = useState("");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const rows = (data ?? []).filter((r) => (!person || r.employee.id === person) && matchesFilter(r.day, filter));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && onChange(e.target.value, filter)} aria-label="Day" className={cn(selectCls, "min-w-0")} />
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" className={selectCls}>
          <option value="">Everyone</option>
          {(data ?? []).map((r) => <option key={r.employee.id} value={r.employee.id}>{r.employee.name}</option>)}
        </select>
        <select value={filter} onChange={(e) => onChange(date, e.target.value as DayFilter)} aria-label="Status" className={selectCls}>
          <option value="">All statuses</option>
          {DAY_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {data && (
        <p className="text-xs text-ink-faint">
          {(["Present", "Absent", "Missed punch"] as AttStatus[]).map((s) => `${data.filter((r) => r.day?.status === s).length} ${s.toLowerCase()}`).join(" · ")}
          {` · ${data.filter((r) => r.day?.late).length} late`}
        </p>
      )}
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : rows.length === 0 ? (
        <EmptyState icon={Users} title="Nobody matches" text={filter ? `No one is "${filter}" on ${formatDate(date)}.` : undefined} />
      ) : (
        <Card className="divide-y divide-surface-border">
          {rows.map((r) => (
            <PersonDayRow key={r.employee.id} person={r.employee} day={r.day} date={date}
              onEdit={() => setEditing({ employeeId: r.employee.id, name: r.employee.name, date, day: r.day })} />
          ))}
        </Card>
      )}
      <DayEdit target={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}

/** Month totals per person; tap someone for their month (calendar + edit). */
export function TeamMonth({ month, person, onChange }: { month: string; person: string; onChange: (month: string, person: string) => void }) {
  const { data, loading, error, reload } = useApi(() => (person ? Promise.resolve(null) : api.attTeamMonth(`${month}-01`)), [month, person]);
  const [q, setQ] = useState("");
  const [flag, setFlag] = useState<"" | "absent" | "late" | "lateHalf" | "short" | "missed">("");
  if (person) {
    return (
      <div className="space-y-3">
        <SecondaryButton onClick={() => onChange(month, "")}><ArrowLeft className="h-4 w-4" /> Everyone</SecondaryButton>
        <MonthView employeeId={person} month={month} canEdit onMonth={(m) => onChange(m, person)} />
      </div>
    );
  }
  const test = (r: AttTeamMonthRow) => {
    const s = r.summary;
    if (flag === "absent") return s.absent > 0;
    if (flag === "late") return s.lates > 0;
    if (flag === "lateHalf") return s.lateHalves > 0;
    if (flag === "short") return s.shortDays > 0;
    if (flag === "missed") return s.missed > 0;
    return true;
  };
  const rows = (data ?? []).filter((r) => r.employee.name.toLowerCase().includes(q.toLowerCase()) && test(r));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={(m) => onChange(m, "")} />
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person" aria-label="Search person" className={cn(inputCls, "min-h-10 rounded-full py-2 pl-9")} />
        </div>
        <select value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)} aria-label="Show" className={selectCls}>
          <option value="">Everyone</option>
          <option value="absent">With absents</option>
          <option value="late">With lates</option>
          <option value="lateHalf">With late halves</option>
          <option value="short">With short days</option>
          <option value="missed">With missed punches</option>
        </select>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : rows.length === 0 ? <EmptyState icon={Users} title="Nobody matches" /> : (
        <Card className="divide-y divide-surface-border">
          {rows.map((r) => {
            const s = r.summary;
            return (
              <button key={r.employee.id} onClick={() => onChange(month, r.employee.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-ink">{r.employee.name} <span className="font-normal text-ink-faint">· {r.employee.id}</span></p>
                  <p className="mt-0.5 break-words text-xs text-ink-muted">
                    P {s.present} · A {s.absent} · W {s.weekoff}{s.weekoffWorked ? ` · WW ${s.weekoffWorked}` : ""}{s.paidLeave ? ` · PL ${s.paidLeave}` : ""}
                    {` · Late ${s.lates}`}{s.lateDeduction ? ` (−${n1(s.lateDeduction)})` : ""}{s.shortDays ? ` · Short ${s.shortDays}` : ""}
                    {s.missed ? <span className="text-status-danger"> · {s.missed} missed punch</span> : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold text-ink">{n1(s.netPayable)}</p>
                  <p className="text-[0.6875rem] text-ink-faint">payable</p>
                  {r.salary && <p className="text-xs font-medium text-ink-muted">{formatINR(r.salary.final)}</p>}
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/** Days with only an In or only an Out (this month and last). Not counted until fixed. */
export function MissedPunches({ onChange }: { onChange?: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.attMissed());
  const [editing, setEditing] = useState<EditTarget | null>(null);
  return (
    <div className="space-y-3">
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
        <EmptyState icon={CircleCheck} title="No missed punches" text="Every day this month and last has both punches, or HR has fixed it." />
      ) : (
        <Card className="divide-y divide-surface-border">
          {(data ?? []).map((r) => (
            <div key={`${r.employee.id}${r.day.date}`}>
              <p className="px-3.5 pt-2.5 text-xs font-medium text-ink-faint sm:px-4">{formatDate(r.day.date, { weekday: true })}</p>
              <PersonDayRow person={r.employee} day={r.day} date={r.day.date}
                onEdit={() => setEditing({ employeeId: r.employee.id, name: r.employee.name, date: r.day.date, day: r.day })} />
            </div>
          ))}
        </Card>
      )}
      <DayEdit target={editing} onClose={() => setEditing(null)} onSaved={() => { reload(); onChange?.(); }} />
    </div>
  );
}

const SALARY_COLUMNS = ["Name", "Code", "Days in month", "Present", "Absent", "Weekoff", "Weekoff worked", "Paid leave", "Lates",
  "Late deductions", "Short days", "Net payable", "Monthly salary", "Final salary"] as const;
// Column positions used below.
const C = { days: 2, present: 3, absent: 4, weekoff: 5, worked: 6, paid: 7, lates: 8, lateDed: 9, short: 10, net: 11, monthly: 12, final: 13 };

/** Admin only: salary per person for a month, and the Excel download. */
export function SalarySheet() {
  const toast = useToast();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data, loading, error, reload } = useApi(() => api.attSalarySheet(`${month}-01`), [month]);
  const rows = useMemo(() => (data ?? []).map((r) => {
    const s = r.summary;
    return [r.employee.name, r.employee.id, s.daysInMonth, s.present, s.absent, s.weekoff, s.weekoffWorked, s.paidLeave, s.lates,
      n1(s.lateDeduction), s.shortDays, n1(s.netPayable), r.salary?.monthly ?? 0, r.salary?.final ?? 0] as (string | number)[];
  }), [data]);
  const total = rows.reduce((t, r) => t + Number(r[C.final]), 0);

  const download = async () => {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([[...SALARY_COLUMNS], ...rows, [], ["Total", ...Array(C.final - 1).fill(""), total]]);
      ws["!cols"] = SALARY_COLUMNS.map((c, i) => ({ wch: i === 0 ? 24 : Math.max(10, c.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, monthLabel(month).slice(0, 31));
      XLSX.writeFile(wb, `Y2B-Salary-Sheet-${month}.xlsx`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        <SecondaryButton onClick={download} disabled={!rows.length}><Download className="h-4 w-4" /> Salary Sheet (Excel)</SecondaryButton>
      </div>
      <p className="text-xs text-ink-faint">Final salary = monthly salary ÷ days in month × net payable days. Missed punches count as nothing until fixed.</p>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : !rows.length ? <EmptyState icon={Users} title="No one this month" /> : (
        <>
          {/* Phones: one card per person. */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={String(r[1])} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-medium text-ink">{r[0]} <span className="font-normal text-ink-faint">· {r[1]}</span></p>
                  <p className="shrink-0 text-base font-semibold text-ink">{formatINR(Number(r[C.final]))}</p>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Net {r[C.net]} / {r[C.days]} days · of {formatINR(Number(r[C.monthly]))} · P {r[C.present]} · A {r[C.absent]} · W {r[C.weekoff]}{Number(r[C.worked]) ? ` · WW ${r[C.worked]}` : ""}{Number(r[C.paid]) ? ` · PL ${r[C.paid]}` : ""} · Late {r[C.lates]} (−{r[C.lateDed]}) · Short {r[C.short]}
                </p>
              </Card>
            ))}
            <p className="px-1 text-right text-sm font-semibold text-ink">Total {formatINR(total)}</p>
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  {SALARY_COLUMNS.map((c, i) => <th key={c} className={cn("px-2 py-2.5 align-bottom font-medium leading-tight", i < 2 ? "text-left" : "text-right")}>{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={String(r[1])}>
                    {r.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-2 py-2", i < 2 ? "text-left" : "text-right", i === C.final && "font-semibold")}>
                        {i >= C.monthly ? formatINR(Number(v)) : v}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-2" colSpan={C.final}>Total</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{formatINR(total)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
