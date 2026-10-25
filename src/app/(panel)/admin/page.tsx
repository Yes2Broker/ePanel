"use client";

import { Users, UserCheck, FileText, Building2, CalendarOff, Inbox, Clock, CircleAlert } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PerformanceTable } from "@/components/dashboard/performance-table";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { InstallBanner } from "@/components/pwa/install-banner";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
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
  const employees = useApi(() => api.listEmployees());
  const { data, loading, error, reload } = useApi(() => (anyFeatureOn ? api.adminDashboard() : Promise.resolve(null)));
  const leave = useApi(() => (on.leave ? api.leaveDashboard() : Promise.resolve(null)));
  const att = useApi(() => (on.attendance ? api.attDashboard() : Promise.resolve(null)));
  const team = att.data?.team;

  const all = employees.data ?? [];
  const active = all.filter((e) => e.status === "Active");
  const departments = new Set(active.map((e) => e.department)).size;

  return (
    <div className="space-y-4 pt-1 md:space-y-6 md:pt-4">
      <PageHeader title="Dashboard" subtitle="Your team at a glance." />
      <InstallBanner />

      <ErrorBanner message={employees.error} onRetry={employees.reload} />
      <ErrorBanner message={error} onRetry={reload} />
      {employees.loading && !employees.data && <Loading />}

      {employees.data && (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <SummaryCard icon={Users} label="Employees" value={active.length} note={`${all.length - active.length} inactive`} href="/admin/employees" />
          <SummaryCard icon={Building2} label="Departments" value={departments} note={`${active.filter((e) => e.role !== "Employee").length} HR / Admin`} />
          {on.reports && data && <SummaryCard icon={FileText} label="Reports Today" value={data.reportsToday} note="filed today" href="/reports" />}
          {on.leave && leave.data?.onLeaveToday && (
            <SummaryCard icon={CalendarOff} label="On leave today" value={leave.data.onLeaveToday.length}
              note={leave.data.onLeaveToday.map((p) => `${p.name.split(" ")[0]}${p.portion < 1 ? " (½)" : ""}`).join(", ") || "Everyone in"}
              href="/leave?tab=calendar" />
          )}
          {on.leave && leave.data && leave.data.pendingApprovals != null && (
            <SummaryCard icon={Inbox} label="Pending approvals" value={leave.data.pendingApprovals}
              note="leave and comp-offs" href="/leave?tab=requests" />
          )}
        </div>
      )}

      {/* Attendance on the last uploaded day. */}
      {on.attendance && team && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Attendance · {formatDate(team.date, { weekday: true })} <span className="font-normal text-ink-faint">(last uploaded day)</span></h2>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            <SummaryCard icon={UserCheck} label="Present" value={team.present} note={team.onLeave ? `${team.onLeave} on leave / paid leave` : undefined} href={`/attendance?tab=day&date=${team.date}`} />
            <SummaryCard icon={Clock} label="Late" value={team.late} href={`/attendance?tab=day&date=${team.date}&filter=Late`} />
            <SummaryCard icon={Users} label="Absent" value={team.absent} href={`/attendance?tab=day&date=${team.date}&filter=Absent`} />
            <SummaryCard icon={CircleAlert} label="Missed punch" value={team.missed} href="/attendance?tab=missed" />
          </div>
        </section>
      )}

      <ComingSoonCard />
      {anyFeatureOn && loading && !data && <Loading />}

      {employees.data && <PerformanceTable employees={active} stats={data?.employeeStats} />}
    </div>
  );
}
