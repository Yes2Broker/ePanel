"use client";

import { Target, Award, ListChecks, CheckCircle2, FileEdit, Calendar, ChevronDown } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { TopPerformers } from "@/components/dashboard/top-performers";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { PerformanceTable } from "@/components/dashboard/performance-table";
import { WeeklyTrendChart } from "@/components/dashboard/weekly-trend-chart";
import { GhostButton } from "@/components/ui/button";
import { employees } from "@/data/employees";
import { monthlyPerformance, weeklyAttendanceTrend } from "@/data/attendance";

export default function AdminDashboardPage() {
  const topPerformers = employees.filter((e) => e.status === "Active").slice(0, 4);

  const performanceRows = employees.slice(0, 5).map((e, i) => ({
    employee: e,
    attendancePct: [96, 88, 91, 100, 84][i % 5],
    tasksDone: [92, 76, 68, 100, 45][i % 5],
    reviewDate: "12 Oct 2026",
    status: (i % 3 === 1 ? "On Track" : "Completed") as "Completed" | "On Track",
  }));

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Company goals and team results.</p>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton><FileEdit className="h-4 w-4" /> Customize Dashboard</GhostButton>
          <GhostButton><Calendar className="h-4 w-4" /> Today <ChevronDown className="h-3.5 w-3.5" /></GhostButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={Target} label="Total Employees" value={employees.length} delta="16%" note={`${employees.filter(e=>e.status==="Active").length} active`} />
        <SummaryCard icon={Award} label="Present Today" value="7/8" delta="12%" note="1 on leave" />
        <SummaryCard icon={ListChecks} label="Tasks Completed" value={38} delta="16%" note="+8 this week" />
        <SummaryCard icon={CheckCircle2} label="Reports Submitted" value={5} delta="4%" note="today" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_1.6fr]">
        <TopPerformers employees={topPerformers} />
        <PerformanceChart data={monthlyPerformance} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_minmax(0,1fr)]">
        <PerformanceTable rows={performanceRows} />
        <WeeklyTrendChart data={weeklyAttendanceTrend} />
      </div>
    </div>
  );
}
