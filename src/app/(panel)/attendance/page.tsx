"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, X, CalendarOff, Pencil, CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { StatusPill } from "@/components/ui/pills";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { AttendanceEdit, EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttendanceRecord, TeamAttendanceRow } from "@/types";
import { formatDate, formatMinutes, formatTime, todayISO } from "@/lib/utils";

type View = "mine" | "team";

export default function AttendancePage() {
  const { isManager, permissions } = useSession();
  const canTrack = !!permissions?.attendance;
  const [view, setView] = useState<View>(canTrack ? "mine" : "team");

  return (
    <div className="space-y-5 pt-4">
      <PageHeader
        title="Attendance"
        subtitle={view === "team" ? "Who's in today, and corrections for any day." : "Check in when you arrive and check out when you leave."}
      />
      {isManager && canTrack && (
        <Tabs value={view} onChange={setView} tabs={[{ value: "mine", label: "My attendance" }, { value: "team", label: "Team" }]} />
      )}
      {view === "mine" && canTrack && <MyAttendance />}
      {view === "team" && isManager && <TeamAttendance />}
      {!canTrack && !isManager && (
        <EmptyState icon={CalendarCheck} title="Attendance isn't enabled for you" text="Contact HR or Admin if you think this is a mistake." />
      )}
    </div>
  );
}

function MyAttendance() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data: rows, setData, loading, error, reload } = useApi(() => api.myAttendance(`${month}-01`), [month]);
  const today = todayISO();
  const todayRow = rows?.find((r) => r.date === today) ?? null;
  const isCurrentMonth = month === today.slice(0, 7);

  const counts = useMemo(() => (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    if (r.status) acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {}), [rows]);

  const updateToday = (row: AttendanceRecord) => {
    if (!rows) return;
    setData(rows.some((r) => r.date === row.date) ? rows.map((r) => (r.date === row.date ? row : r)) : [row, ...rows]);
  };

  return (
    <>
      {isCurrentMonth && rows && <CheckInCard today={todayRow} onChange={updateToday} />}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Monthly record</h2>
        <input
          type="month"
          value={month}
          max={today.slice(0, 7)}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="rounded-pill border border-surface-border bg-white px-3 py-1.5 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={CheckCircle2} label="Present" value={(counts.Present || 0) + (counts["Half Day"] || 0)} note={counts["Half Day"] ? `incl. ${counts["Half Day"]} half day` : undefined} />
        <SummaryCard icon={AlertCircle} label="Late" value={counts.Late || 0} />
        <SummaryCard icon={X} label="Absent" value={counts.Absent || 0} />
        <SummaryCard icon={CalendarOff} label="Leave" value={counts.Leave || 0} />
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      <Card className="overflow-hidden p-5">
        {loading && !rows ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Date</th>
                  <th className="px-2 py-2.5">Check In</th>
                  <th className="px-2 py-2.5">Check Out</th>
                  <th className="px-2 py-2.5">Hours</th>
                  <th className="px-2 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.date} className="border-b border-surface-border last:border-0 hover:bg-surface">
                    <td className="px-2 py-2.5 text-ink">{formatDate(r.date, { weekday: true })}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatTime(r.checkIn)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatTime(r.checkOut)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatMinutes(r.minutes)}</td>
                    <td className="px-2 py-2.5">
                      {r.status ? <StatusPill status={r.status} /> : <span className="text-xs text-ink-faint">Not checked in</span>}
                      {r.note && <p className="mt-0.5 text-xs text-ink-faint">{r.note}</p>}
                    </td>
                  </tr>
                ))}
                {rows?.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-10 text-center text-sm text-ink-faint">No attendance recorded for this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function TeamAttendance() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const { data: rows, setData, loading, error, reload } = useApi(() => api.teamAttendance(date), [date]);
  const [editing, setEditing] = useState<TeamAttendanceRow | null>(null);
  const [saving, setSaving] = useState(false);

  const inCount = rows?.filter((r) => r.checkIn).length ?? 0;
  const lateCount = rows?.filter((r) => r.status === "Late").length ?? 0;
  const leaveCount = rows?.filter((r) => r.status === "Leave").length ?? 0;

  const save = async (edit: AttendanceEdit) => {
    if (!editing || !rows) return;
    setSaving(true);
    try {
      const updated = await api.setAttendance({ employeeId: editing.employee.id, date, ...edit });
      setData(rows.map((r) => (r.employee.id === editing.employee.id ? { ...r, ...updated } : r)));
      toast(`Attendance updated for ${editing.employee.name}.`);
      setEditing(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {rows ? <>{inCount} of {rows.length} checked in · {lateCount} late · {leaveCount} on leave</> : " "}
        </p>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-pill border border-surface-border bg-white px-3 py-1.5 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      <Card className="overflow-hidden p-5">
        {loading && !rows ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Employee</th>
                  <th className="px-2 py-2.5">Check In</th>
                  <th className="px-2 py-2.5">Check Out</th>
                  <th className="px-2 py-2.5">Hours</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.employee.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.employee.name} />
                        <div>
                          <p className="font-medium text-ink">{r.employee.name}</p>
                          <p className="text-xs text-ink-faint">{r.employee.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatTime(r.checkIn)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatTime(r.checkOut)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatMinutes(r.minutes)}</td>
                    <td className="px-2 py-2.5">
                      {r.status ? <StatusPill status={r.status} /> : <span className="text-xs text-ink-faint">Not in yet</span>}
                      {r.note && <p className="mt-0.5 text-xs text-ink-faint">{r.note}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted" title="Correct attendance" aria-label={`Correct attendance for ${r.employee.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows?.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-10 text-center text-sm text-ink-faint">No active employees.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditAttendanceDialog row={editing} onClose={() => setEditing(null)} onSave={save} saving={saving} />
    </>
  );
}
