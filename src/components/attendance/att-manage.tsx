"use client";

import { useMemo, useState } from "react";
import { Download, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttDay, PersonRef } from "@/types";
import { cn, formatDate, formatINR, todayISO } from "@/lib/utils";
import { AttPill, hours } from "@/components/attendance/att-format";
import { DayEdit, EditTarget } from "@/components/attendance/day-edit";
import { Calendar, MonthPicker, SummaryGrid, monthLabel } from "@/components/attendance/month-view";

const n1 = (v: number) => Number(v.toFixed(1));

export type StatusFilter = "" | "Present" | "Absent" | "Weekoff" | "Paid Leave" | "Late" | "Short Day";
const STATUS_FILTERS: StatusFilter[] = ["Present", "Absent", "Weekoff", "Paid Leave", "Late", "Short Day"];

function matches(d: AttDay, f: StatusFilter) {
  if (!f) return true;
  if (f === "Late") return d.late;
  if (f === "Short Day") return d.shortDay;
  return d.status === f;
}

/** Late / Half Day columns, as in the old sheet. */
const lateText = (d: AttDay) => (d.status === "Present" ? (d.late ? "Yes" : "No") : "");
const halfText = (d: AttDay) => (d.status !== "Present" ? "" : d.shortDay ? "Short Day" : d.lateHalf ? "Late Half" : "No");

interface Row { employee: PersonRef; day: AttDay }

/**
 * The attendance screen: filters + one row per person per day.
 * HR/Admin (`manager`): everyone, Employee filter, tap a row to edit.
 * Otherwise: the signed-in person's own days, Month filter only.
 * With one person selected: their month summary and a Calendar toggle.
 */
export function AttendanceList({ manager }: { manager: boolean }) {
  const { user } = useSession();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [emp, setEmp] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const people = useApi(() => (manager ? api.listEmployees() : Promise.resolve(null)), [manager]);
  const team = useApi(() => (manager ? api.attTeamDays(`${month}-01`, emp || null) : Promise.resolve(null)), [manager, month, emp]);
  const one = manager ? emp : user?.id ?? "";
  const person = useApi(() => (one ? api.attMonth(manager ? one : null, `${month}-01`) : Promise.resolve(null)), [one, month, manager]);

  const rows: Row[] = manager
    ? (team.data ?? [])
    : (person.data?.days ?? []).map((d) => ({ employee: person.data!.employee, day: d }));
  const shown = rows.filter((r) => matches(r.day, status));
  const loading = manager ? team.loading && !team.data : person.loading && !person.data;
  const error = manager ? team.error : person.error;
  const reload = () => { team.reload(); person.reload(); };
  const edit = manager ? (r: Row) => setEditing({ employeeId: r.employee.id, name: r.employee.name, date: r.day.date, day: r.day }) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        {manager && (
          <select value={emp} onChange={(e) => { setEmp(e.target.value); if (!e.target.value) setView("list"); }} aria-label="Employee" className={selectCls}>
            <option value="">All employees</option>
            {(people.data ?? []).filter((e) => e.status === "Active" && e.role !== "Admin").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status" className={selectCls}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {one && (
          <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
            {(["list", "calendar"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium capitalize", view === v ? "bg-ink text-white" : "text-ink-muted")}>{v}</button>
            ))}
          </div>
        )}
      </div>

      {person.data && <SummaryGrid s={person.data.summary} salary={person.data.salary} />}
      <ErrorBanner message={error} onRetry={reload} />
      {loading ? <Loading /> : view === "calendar" && person.data ? (
        <Calendar month={month} days={person.data.days} onPick={edit ? (d) => edit({ employee: person.data!.employee, day: d }) : undefined} />
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} title="No attendance" text={rows.length ? "Nothing matches these filters." : `Nothing uploaded for ${monthLabel(month)} yet.`} />
      ) : (
        <DayTable rows={shown} showName={manager} onPick={edit} />
      )}
      {manager && <p className="text-xs text-ink-faint">Tap a row to change that day. Days after the last upload aren&apos;t shown yet.</p>}
      <DayEdit target={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </div>
  );
}

function DayTable({ rows, showName, onPick }: { rows: Row[]; showName: boolean; onPick?: (r: Row) => void }) {
  const cols = ["Date", ...(showName ? ["Name"] : []), "In", "Out", "Working Hours", "Late", "Half Day / Short Day", "Status", "Remark"];
  return (
    <>
      {/* Phones: one compact card per row. */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => {
          const d = r.day;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium text-ink">
                  {formatDate(d.date, { weekday: true })}{showName && <span className="font-normal text-ink-muted"> · {r.employee.name}</span>}
                </p>
                <AttPill status={d.status} />
              </div>
              <p className="mt-1 break-words text-xs text-ink-muted">
                {d.in ?? "—"} – {d.out ?? "—"} · {hours(d.minutes)} h
                {lateText(d) && ` · Late ${lateText(d)}`}{halfText(d) && ` · Half ${halfText(d)}`}
                {d.note && ` · ${d.note}`}{d.edited && " · edited"}
              </p>
            </>
          );
          return onPick ? (
            <button key={`${r.employee.id}${d.date}`} onClick={() => onPick(r)} className="block w-full rounded-card bg-white p-3 text-left shadow-card active:bg-surface">{body}</button>
          ) : (
            <Card key={`${r.employee.id}${d.date}`} className="p-3">{body}</Card>
          );
        })}
      </div>
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead><tr className={tableHeadCls}>{cols.map((c) => <th key={c} className="px-2 py-2.5 text-left align-bottom font-medium leading-tight">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((r) => {
              const d = r.day;
              return (
                <tr key={`${r.employee.id}${d.date}`} onClick={onPick ? () => onPick(r) : undefined} className={cn(onPick && "cursor-pointer hover:bg-surface")}>
                  <td className="whitespace-nowrap px-2 py-2">{formatDate(d.date, { weekday: true })}</td>
                  {showName && <td className="whitespace-nowrap px-2 py-2">{r.employee.name}</td>}
                  <td className="px-2 py-2">{d.in ?? "—"}</td>
                  <td className="px-2 py-2">{d.out ?? "—"}</td>
                  <td className="px-2 py-2">{d.minutes != null ? hours(d.minutes) : "—"}</td>
                  <td className={cn("px-2 py-2", d.late && "text-status-warning")}>{lateText(d)}</td>
                  <td className={cn("px-2 py-2", (d.shortDay || d.lateHalf) && "text-status-danger")}>{halfText(d)}</td>
                  <td className="px-2 py-2"><AttPill status={d.status} /></td>
                  <td className="px-2 py-2 text-ink-muted">{d.note}{d.edited && <span className="text-ink-faint"> (edited)</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

const SALARY_COLUMNS = ["Name", "Days in month", "Present", "Absent", "Weekoff", "Weekoff worked", "Paid leave", "Lates",
  "Late deductions", "Short days", "Net payable", "Monthly salary", "Final salary"] as const;
// Column positions used below.
const C = { days: 1, present: 2, absent: 3, weekoff: 4, worked: 5, paid: 6, lates: 7, lateDed: 8, short: 9, net: 10, monthly: 11, final: 12 };

/** Admin only: salary per person for a month, and the Excel download. */
export function SalarySheet() {
  const toast = useToast();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data, loading, error, reload } = useApi(() => api.attSalarySheet(`${month}-01`), [month]);
  const rows = useMemo(() => (data ?? []).map((r) => {
    const s = r.summary;
    return [r.employee.name, s.daysInMonth, s.present, s.absent, s.weekoff, s.weekoffWorked, s.paidLeave, s.lates,
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
      <p className="text-xs text-ink-faint">Final salary = monthly salary ÷ days in month × net payable days. Weekly-off working offsets absent days.</p>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : !rows.length ? <EmptyState icon={Users} title="No one this month" /> : (
        <>
          {/* Phones: one card per person. */}
          <div className="space-y-2 md:hidden">
            {rows.map((r, ri) => (
              <Card key={(data ?? [])[ri]?.employee.id ?? ri} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-medium text-ink">{r[0]}</p>
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
                  {SALARY_COLUMNS.map((c, i) => <th key={c} className={cn("px-2 py-2.5 align-bottom font-medium leading-tight", i < 1 ? "text-left" : "text-right")}>{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r, ri) => (
                  <tr key={(data ?? [])[ri]?.employee.id ?? ri}>
                    {r.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-2 py-2", i < 1 ? "text-left" : "text-right", i === C.final && "font-semibold")}>
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
