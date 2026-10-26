"use client";

import Link from "next/link";
import { useState } from "react";
import { Users, UserCheck, FileText, Building2, CalendarOff, Inbox, Clock, BarChart3 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { DashboardGrid, Section } from "@/components/dashboard/dashboard-grid";
import { CustomiseButton, CustomisePanel, DashboardEmpty, useDashboardLayout } from "@/components/dashboard/customise";
import { AttUpdateBanner } from "@/components/attendance/att-update-banner";
import { PerformanceTable } from "@/components/dashboard/performance-table";
import { Leaderboard } from "@/components/dashboard/leaderboard";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { InstallBanner } from "@/components/pwa/install-banner";
import { Card } from "@/components/ui/card";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { FEATURE_KEYS, isFeatureEnabled } from "@/lib/features";

const on = {
  attendance: isFeatureEnabled("attendance"),
  reports: isFeatureEnabled("reports"),
  leave: isFeatureEnabled("leave"),
};
// The stats call only feeds feature widgets, so skip it while every feature is off.
const anyFeatureOn = FEATURE_KEYS.some(isFeatureEnabled);

export default function AdminDashboardPage() {
  const { user } = useSession();
  const employees = useApi(() => api.listEmployees());
  const { data, loading, error, reload } = useApi(() => (anyFeatureOn ? api.adminDashboard() : Promise.resolve(null)));
  const leave = useApi(() => (on.leave ? api.leaveDashboard() : Promise.resolve(null)));
  const att = useApi(() => (on.attendance ? api.attDashboard() : Promise.resolve(null)));
  const team = att.data?.team;

  // Only what this person's role and launched features allow. Admin has no attendance of their own.
  const available = [
    on.attendance && user?.role === "HR" && "attBanner",
    "employees", "departments",
    on.reports && "reportsToday", on.reports && "reportsMonth",
    on.leave && "onLeaveToday", on.leave && "pendingLeave",
    on.attendance && "teamAttendance",
    on.reports && "recentReports",
    on.reports && "leaderboard",
    "overview",
  ].filter(Boolean) as string[];
  const dash = useDashboardLayout("manager", available);
  const [customising, setCustomising] = useState(false);

  const all = employees.data ?? [];
  const active = all.filter((e) => e.status === "Active");
  const departments = new Set(active.map((e) => e.department)).size;

  const sections: Record<string, () => Section> = {
    attBanner: () => ({ block: <AttUpdateBanner where="dashboard" href={(m) => `/attendance?tab=mine&month=${m}`} /> }),
    employees: () => employees.data && ({ tile: <SummaryCard icon={Users} label="Employees" value={active.length} note={`${all.length - active.length} inactive`} href="/admin/employees" /> }),
    departments: () => employees.data && ({ tile: <SummaryCard icon={Building2} label="Departments" value={departments} note={`${active.filter((e) => e.role !== "Employee").length} HR / Admin`} /> }),
    reportsToday: () => data && ({ tile: <SummaryCard icon={FileText} label="Reports Today" value={data.reportsToday} note="filed today" href="/reports" /> }),
    reportsMonth: () => data && data.reportsThisMonth != null && ({ tile: <SummaryCard icon={BarChart3} label="Reports this month" value={data.reportsThisMonth} note="filed by the team" href="/reports" /> }),
    onLeaveToday: () => leave.data?.onLeaveToday && ({ tile: (
      <SummaryCard icon={CalendarOff} label="On leave today" value={leave.data.onLeaveToday.length}
        note={leave.data.onLeaveToday.map((p) => `${p.name.split(" ")[0]}${p.portion < 1 ? " (½)" : ""}`).join(", ") || "Everyone in"}
        href="/leave" />
    ) }),
    pendingLeave: () => leave.data && leave.data.pendingApprovals != null && ({ tile: (
      <SummaryCard icon={Inbox} label="Pending approvals" value={leave.data.pendingApprovals} note="leave requests" href="/leave" />
    ) }),
    // Attendance on the last uploaded day.
    teamAttendance: () => team && ({ block: (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Attendance · {formatDate(team.date, { weekday: true })} <span className="font-normal text-ink-faint">(last uploaded day)</span></h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <SummaryCard icon={UserCheck} label="Present" value={team.present} note={team.onLeave ? `${team.onLeave} on paid leave` : undefined} href="/attendance" />
          <SummaryCard icon={Clock} label="Late" value={team.late} href="/attendance" />
          <SummaryCard icon={Users} label="Absent" value={team.absent} href="/attendance" />
        </div>
      </section>
    ) }),
    recentReports: () => data?.recentReports && ({ half: (
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Recent Reports</h3>
          <Link href="/reports" className="-my-2 inline-flex min-h-11 items-center px-2 text-xs font-medium text-ink-muted hover:text-ink">View all</Link>
        </div>
        {data.recentReports.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">No reports yet.</p>
        ) : (
          <ul className="space-y-1">
            {data.recentReports.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-surface">
                <div className="min-w-0">
                  <p className="break-words text-sm text-ink">{r.employeeName}</p>
                  <p className="break-words text-xs text-ink-faint">{r.title}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-faint">{formatDate(r.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ) }),
    leaderboard: () => ({ block: <Leaderboard /> }),
    overview: () => employees.data && ({ block: <PerformanceTable employees={active} stats={data?.employeeStats} /> }),
  };

  return (
    <div className="space-y-4 pt-1 md:space-y-6 md:pt-4">
      <PageHeader title="Dashboard" subtitle="Your team at a glance." actions={<CustomiseButton onClick={() => setCustomising(true)} />} />
      <InstallBanner />
      <ComingSoonCard />

      <ErrorBanner message={employees.error} onRetry={employees.reload} />
      <ErrorBanner message={error} onRetry={reload} />

      {dash.shown.length === 0 ? (
        <DashboardEmpty onCustomise={() => setCustomising(true)} />
      ) : (
        <>
          {employees.loading && !employees.data && <Loading />}
          <DashboardGrid sections={dash.shown.map((id) => [id, sections[id]?.()] as [string, Section])} />
          {anyFeatureOn && loading && !data && <Loading />}
        </>
      )}

      <CustomisePanel open={customising} onClose={() => setCustomising(false)} kind="manager" available={available}
        layout={dash.layout} preset={dash.preset} onChange={dash.change} onReset={dash.reset} />
    </div>
  );
}
