"use client";

import { Users, UserCheck, CalendarOff, FileText } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TopPerformers } from "@/components/dashboard/top-performers";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { PerformanceTable } from "@/components/dashboard/performance-table";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { todayISO } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { permissions } = useSession();
  const { data, loading, error, reload } = useApi(() => api.adminDashboard());
  // HR/Admin check in too; load their own row for the widget.
  const mine = useApi(
    () => (permissions?.attendance ? api.myAttendance(todayISO()) : Promise.resolve([])),
    [permissions?.attendance]
  );
  const todayRow = mine.data?.find((r) => r.date === todayISO()) ?? null;

  return (
    <div className="space-y-6 pt-4">
      <PageHeader title="Dashboard" subtitle="Today at a glance, and how the team is doing this month." />

      {permissions?.attendance && mine.data && (
        <CheckInCard today={todayRow} onChange={() => { mine.reload(); reload(); }} />
      )}

      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard icon={Users} label="Employees" value={data.activeEmployees} note={`${data.totalEmployees - data.activeEmployees} inactive`} href="/admin/employees" />
            <SummaryCard
              icon={UserCheck} label="Present Today" value={`${data.presentToday}/${data.activeEmployees}`}
              note={`${data.lateToday} late · ${data.onLeaveToday} on leave`} href="/attendance"
            />
            <SummaryCard icon={CalendarOff} label="Leave Requests" value={data.pendingLeaves} note="awaiting approval" href="/leave" />
            <SummaryCard icon={FileText} label="Reports Today" value={data.reportsToday} note={`${data.pendingReports} awaiting review`} href="/reports" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_1.6fr]">
            <TopPerformers stats={data.employeeStats} />
            <PerformanceChart data={data.monthlyTrend} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_minmax(0,1fr)]">
            <PerformanceTable rows={data.employeeStats} />
            <WeeklyTrendChart data={data.weeklyTrend} />
          </div>
        </>
      )}
    </div>
  );
}
