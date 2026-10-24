"use client";

import { Users, UserCheck, CalendarOff, FileText, Building2 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TopPerformers } from "@/components/dashboard/top-performers";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { PerformanceTable } from "@/components/dashboard/performance-table";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { todayISO } from "@/lib/utils";
import { FEATURE_KEYS, isFeatureEnabled } from "@/lib/features";

const on = {
  attendance: isFeatureEnabled("attendance"),
  leave: isFeatureEnabled("leave"),
  reports: isFeatureEnabled("reports"),
};
// The stats call only feeds feature widgets, so skip it while every feature is off.
const anyFeatureOn = FEATURE_KEYS.some(isFeatureEnabled);

export default function AdminDashboardPage() {
  const { permissions } = useSession();
  const employees = useApi(() => api.listEmployees());
  const { data, loading, error, reload } = useApi(() => (anyFeatureOn ? api.adminDashboard() : Promise.resolve(null)));
  // HR/Admin check in too; load their own row for the widget.
  const mine = useApi(
    () => (on.attendance && permissions?.attendance ? api.myAttendance(todayISO()) : Promise.resolve([])),
    [permissions?.attendance]
  );
  const todayRow = mine.data?.find((r) => r.date === todayISO()) ?? null;

  const all = employees.data ?? [];
  const active = all.filter((e) => e.status === "Active");
  const departments = new Set(active.map((e) => e.department)).size;

  return (
    <div className="space-y-6 pt-4">
      <PageHeader title="Dashboard" subtitle="Your team at a glance." />

      {on.attendance && permissions?.attendance && mine.data && (
        <CheckInCard today={todayRow} onChange={() => { mine.reload(); reload(); }} />
      )}

      <ErrorBanner message={employees.error} onRetry={employees.reload} />
      <ErrorBanner message={error} onRetry={reload} />
      {employees.loading && !employees.data && <Loading />}

      {employees.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard icon={Users} label="Employees" value={active.length} note={`${all.length - active.length} inactive`} href="/admin/employees" />
          <SummaryCard icon={Building2} label="Departments" value={departments} note={`${active.filter((e) => e.role !== "Employee").length} HR / Admin`} />
          {on.attendance && data && (
            <SummaryCard
              icon={UserCheck} label="Present Today" value={`${data.presentToday}/${data.activeEmployees}`}
              note={`${data.lateToday} late · ${data.onLeaveToday} on leave`} href="/attendance"
            />
          )}
          {on.leave && data && <SummaryCard icon={CalendarOff} label="Leave Requests" value={data.pendingLeaves} note="awaiting approval" href="/leave" />}
          {on.reports && data && <SummaryCard icon={FileText} label="Reports Today" value={data.reportsToday} note="filed today" href="/reports" />}
        </div>
      )}

      <ComingSoonCard />

      {on.attendance && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_1.6fr]">
          <TopPerformers stats={data.employeeStats} />
          <PerformanceChart data={data.monthlyTrend} />
        </div>
      )}
      {anyFeatureOn && loading && !data && <Loading />}

      {employees.data && (
        <div className={on.attendance && data ? "grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_minmax(0,1fr)]" : ""}>
          <PerformanceTable employees={active} stats={data?.employeeStats} />
          {on.attendance && data && <WeeklyTrendChart data={data.weeklyTrend} />}
        </div>
      )}
    </div>
  );
}
