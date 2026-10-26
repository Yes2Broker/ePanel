"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, tableHeadCls } from "@/components/ui/page";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/pickers";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttDay, AttTeamMonthRow, PersonRef } from "@/types";
import { cn, formatDate, formatINR, todayISO } from "@/lib/utils";
import { AttPill, hours } from "@/components/attendance/att-format";
import { DayEdit, EditTarget } from "@/components/attendance/day-edit";
import { Calendar, MonthPicker, SummaryGrid, monthLabel } from "@/components/attendance/month-view";

const n1 = (v: number) => Number(v.toFixed(1));

type StatusFilter = "" | "Present" | "Absent" | "Weekoff" | "Paid Leave" | "Late" | "Short Day";
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
export function AttendanceList({ manager, initialMonth, initialEmp }: { manager: boolean; initialMonth?: string; initialEmp?: string }) {
  const { user } = useSession();
  const [month, setMonth] = useState(initialMonth || todayISO().slice(0, 7));
  const [emp, setEmp] = useState(manager ? initialEmp ?? "" : "");
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
          <Select ariaLabel="Employee" value={emp} onChange={(v) => { setEmp(v); if (!v) setView("list"); }}
            options={[{ value: "", label: "All employees" }, ...(people.data ?? []).filter((e) => e.status === "Active" && e.role !== "Admin").map((e) => ({ value: e.id, label: e.name }))]} />
        )}
        <Select ariaLabel="Status" value={status} onChange={(v) => setStatus(v as StatusFilter)}
          options={[{ value: "", label: "All statuses" }, ...STATUS_FILTERS.map((f) => ({ value: f, label: f }))]} />
        {one && (
          <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
            {(["list", "calendar"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium capitalize", view === v ? "bg-ink text-white" : "text-ink-muted")}>{v}</button>
            ))}
          </div>
        )}
      </div>

      {manager && <ChecksCard month={month} emp={emp} />}
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

/**
 * HR/Admin: who has checked their updated attendance for the month. With one
 * employee selected, just their badge.
 */
function ChecksCard({ month, emp }: { month: string; emp: string }) {
  const { data } = useApi(() => api.attChecks(month), [month]);
  const [open, setOpen] = useState(false);
  if (!data?.length) return null;
  const done = data.filter((c) => c.checkedAt).length;
  const badge = (checkedAt: string | null) => checkedAt
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-status-successBg px-2 py-0.5 text-xs font-medium text-status-success">✓ Checked {formatDate(checkedAt.slice(0, 10))}</span>
    : <span className="whitespace-nowrap rounded-full bg-status-warningBg px-2 py-0.5 text-xs font-medium text-status-warning">Not checked yet</span>;
  if (emp) {
    const c = data.find((x) => x.employee.id === emp);
    return c ? <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">Attendance check: {badge(c.checkedAt)}</div> : null;
  }
  return (
    <Card className="p-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
        <span className="text-sm text-ink"><b className="font-semibold">{done} of {data.length}</b> checked their {monthLabel(month)} attendance</span>
        <span className="text-xs font-medium text-brand">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-surface-border border-t border-surface-border">
          {data.map((c) => (
            <li key={c.employee.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-sm text-ink">{c.employee.name}</span>
              {badge(c.checkedAt)}
            </li>
          ))}
        </ul>
      )}
    </Card>
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
  const [open, setOpen] = useState<AttTeamMonthRow | null>(null);

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
          {/* Phones: one short card per person; tap for the details. */}
          <div className="space-y-2 md:hidden">
            {(data ?? []).map((r) => (
              <button key={r.employee.id} onClick={() => setOpen(r)} aria-label={`${r.employee.name}: more details`}
                className="flex w-full items-center gap-3 rounded-card bg-white p-3.5 text-left shadow-card active:bg-surface">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-ink">{r.employee.name}</p>
                  <p className="text-xs text-ink-muted">Net {n1(r.summary.netPayable)} / {r.summary.daysInMonth} days</p>
                </div>
                <p className={cn("shrink-0 text-right font-semibold", hasSalary(r) ? "text-base text-ink" : "text-sm text-ink-faint")}>
                  {hasSalary(r) ? formatINR(r.salary!.final) : "Salary not set"}
                </p>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </button>
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
                  <tr key={(data ?? [])[ri]?.employee.id ?? ri} onClick={() => data && setOpen(data[ri])} className="cursor-pointer hover:bg-surface">
                    {r.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-2 py-2", i < 1 ? "text-left" : "text-right", i === C.final && "font-semibold")}>
                        {i >= C.monthly ? (Number(r[C.monthly]) > 0 ? formatINR(Number(v)) : i === C.monthly ? <span className="text-ink-faint">Salary not set</span> : "") : i === C.lateDed && !Number(v) ? "" : v}
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
      <SalaryDetails row={open} month={month} onClose={() => setOpen(null)} />
    </div>
  );
}

const hasSalary = (r: AttTeamMonthRow) => !!r.salary && r.salary.monthly > 0;

/** Plain-words breakdown of one person's salary for the month. */
function SalaryDetails({ row, month, onClose }: { row: AttTeamMonthRow | null; month: string; onClose: () => void }) {
  if (!row) return null;
  const s = row.summary;
  const set = hasSalary(row);
  const perDay = set ? row.salary!.monthly / s.daysInMonth : 0;
  const lines: [string, string][] = [
    ["Days in month", String(s.daysInMonth)],
    ["Present", String(s.present)],
    ["Absent", String(s.absent)],
    ["Weekly off", String(s.weekoff)],
    ["Weekly-off worked", String(s.weekoffWorked)],
    ["Paid leave", String(s.paidLeave)],
    ["Lates", `${s.lates} (2 free)${s.lateDeduction > 0 ? ` · −${n1(s.lateDeduction)} day${s.lateDeduction === 1 ? "" : "s"}` : ""}`],
    ["Short days", `${s.shortDays}${s.shortDays > 0 ? ` · −${n1(s.shortDays * 0.5)} day${s.shortDays * 0.5 === 1 ? "" : "s"}` : ""}`],
    ["Net payable days", String(n1(s.netPayable))],
    ["Monthly salary", set ? formatINR(row.salary!.monthly) : "Salary not set"],
    ["Per-day salary", set ? formatINR(Math.round(perDay)) : "—"],
  ];
  return (
    <Modal open onClose={onClose} title={row.employee.name} subtitle={monthLabel(month)} size="sm">
      <dl className="divide-y divide-surface-border text-sm">
        {lines.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="text-right text-ink">{v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="font-semibold text-ink">Final salary</dt>
          <dd className="text-right text-lg font-semibold text-ink">{set ? formatINR(row.salary!.final) : "Salary not set"}</dd>
        </div>
      </dl>
      <Link href={`/attendance?tab=list&emp=${row.employee.id}&month=${month}`} onClick={onClose}
        className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        See days <ChevronRight className="h-4 w-4" />
      </Link>
    </Modal>
  );
}
