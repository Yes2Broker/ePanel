"use client";

import { CalendarCheck, ListTodo, FileText, Briefcase, Circle, ChevronDown } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { Card } from "@/components/ui/card";
import { PriorityPill, StatusPill } from "@/components/ui/pills";
import { useSession } from "@/context/session-context";
import { tasksInitial } from "@/data/tasks";
import { reportsInitial } from "@/data/reports";

export default function EmployeeDashboardPage() {
  const { user } = useSession();
  if (!user) return null;

  const openTasks = tasksInitial.filter((t) => t.status === "Pending");
  const recentReports = reportsInitial.slice(0, 3);
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">{greeting}, {firstName} 👋</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Here's what's on your plate today.</p>
        </div>
        <button className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-medium text-ink-muted shadow-card">
          September 12, 2026 <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={CalendarCheck} label="Attendance" value="9/12" note="Present days this month" />
        <SummaryCard icon={ListTodo} label="My Tasks" value={openTasks.length} note={`${tasksInitial.length - openTasks.length} completed`} />
        <SummaryCard icon={FileText} label="Daily Report" value="Submitted" note="Yesterday, 07:40 PM" />
        <SummaryCard icon={Briefcase} label="Department" value={user.department} note={user.designation} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Today's Tasks</h3>
            <span className="text-xs text-ink-faint">{openTasks.length} pending</span>
          </div>
          {openTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">No pending tasks. Nice work.</p>
          ) : (
            <ul className="space-y-2">
              {openTasks.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-surface">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Circle className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    <span className="truncate text-sm text-ink">{t.title}</span>
                  </div>
                  <PriorityPill priority={t.priority} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink">Recent Reports</h3>
          <ul className="space-y-2">
            {recentReports.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-surface">
                <div>
                  <p className="text-sm text-ink">{r.type} Report</p>
                  <p className="text-xs text-ink-faint">{r.date}</p>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Recent Activity</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-dark" /><span className="text-ink-muted">You submitted a <span className="font-medium text-ink">Normal Daily Report</span> — yesterday, 07:40 PM</span></li>
          <li className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-neutralBg" /><span className="text-ink-muted">Checked in at 09:58 AM — yesterday</span></li>
          <li className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-neutralBg" /><span className="text-ink-muted">Marked "Update CRM with yesterday's site visits" complete — 2 days ago</span></li>
        </ul>
      </Card>
    </div>
  );
}
