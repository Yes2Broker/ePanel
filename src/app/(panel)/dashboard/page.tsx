"use client";

import Link from "next/link";
import { CalendarCheck, ListTodo, FileText, CalendarOff, Circle, AlertCircle, Briefcase, BadgeCheck, CalendarDays, UserRound } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { Card } from "@/components/ui/card";
import { PriorityPill, StatusPill } from "@/components/ui/pills";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate, todayISO } from "@/lib/utils";
import { weekOffLabel } from "@/lib/constants";
import { FEATURE_KEYS, isFeatureEnabled } from "@/lib/features";

const on = {
  attendance: isFeatureEnabled("attendance"),
  leave: isFeatureEnabled("leave"),
  reports: isFeatureEnabled("reports"),
  tasks: isFeatureEnabled("tasks"),
};
const anyFeatureOn = FEATURE_KEYS.some(isFeatureEnabled);

export default function EmployeeDashboardPage() {
  const { user, permissions } = useSession();
  const { prefs } = usePreferences();
  // Everything this call returns belongs to a feature, so skip it while they're all off.
  const { data, setData, loading, error, reload } = useApi(() => (anyFeatureOn ? api.employeeDashboard() : Promise.resolve(null)));
  if (!user) return null;

  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const canReport = !!(permissions?.normalReport || permissions?.soleSelling);
  const today = todayISO();

  return (
    <div className="space-y-6 pt-4">
      <PageHeader title={`${greeting}, ${firstName} 👋`} subtitle="Welcome to your Yes2Broker panel." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={BadgeCheck} label="Employee ID" value={user.id} />
        <SummaryCard icon={Briefcase} label="Department" value={user.department} note={user.designation || undefined} />
        <SummaryCard icon={CalendarDays} label="Weekly Off" value={weekOffLabel(user.weekOff)} />
        <SummaryCard icon={UserRound} label="Reporting To" value={user.manager || "—"} href="/profile" />
      </div>

      <ComingSoonCard />

      <ErrorBanner message={error} onRetry={reload} />
      {anyFeatureOn && loading && !data && <Loading />}

      {data && (
        <>
          {on.attendance && permissions?.attendance && (
            <CheckInCard today={data.today} isWorkingDay={data.isWorkingDay} onChange={(row) => setData({ ...data, today: row })} />
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {on.attendance && (
              <SummaryCard
                icon={CalendarCheck} label="Attendance"
                value={data.month.rate == null ? "—" : `${data.month.rate}%`}
                note={`${data.month.present}/${data.month.workingDays} days this month${data.month.late ? ` · ${data.month.late} late` : ""}`}
              />
            )}
            {on.tasks && (
              <SummaryCard
                icon={ListTodo} label="My Tasks" value={data.tasks.pending}
                note={data.tasks.overdue ? `${data.tasks.overdue} overdue` : `${data.tasks.completed} completed`}
              />
            )}
            {on.reports && (
              <SummaryCard
                icon={FileText} label="Today's Report"
                value={data.reportFiledToday ? "Filed" : "Pending"}
                note={canReport ? (data.reportFiledToday ? "Thanks — all done" : "Submit before you leave") : "Not required for you"}
                href={canReport ? "/reports" : undefined}
              />
            )}
            {on.leave && (
              <SummaryCard
                icon={CalendarOff} label="Leave"
                value={data.pendingLeaves ? `${data.pendingLeaves} pending` : data.upcomingLeave ? "Upcoming" : "None"}
                note={data.upcomingLeave ? `${formatDate(data.upcomingLeave.startDate)} – ${formatDate(data.upcomingLeave.endDate)}` : "No upcoming leave"}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {on.tasks && prefs.dashboard.tasks && permissions?.tasks && (
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Upcoming Tasks</h3>
                  <Link href="/tasks" className="text-xs font-medium text-ink-muted hover:text-ink">View all</Link>
                </div>
                {data.tasks.upcoming.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-faint">No pending tasks. Nice work.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.tasks.upcoming.map((t) => {
                      const overdue = !!t.dueDate && t.dueDate < today;
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-surface">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {overdue ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-danger" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-ink-faint" />}
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink">{t.title}</p>
                              {t.dueDate && <p className={overdue ? "text-xs text-status-danger" : "text-xs text-ink-faint"}>Due {formatDate(t.dueDate)}</p>}
                            </div>
                          </div>
                          <PriorityPill priority={t.priority} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            {on.reports && prefs.dashboard.reports && canReport && (
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Recent Reports</h3>
                  <Link href="/reports" className="text-xs font-medium text-ink-muted hover:text-ink">View all</Link>
                </div>
                {data.recentReports.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-faint">No reports yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.recentReports.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-xl px-2 py-2.5 hover:bg-surface">
                        <div>
                          <p className="text-sm text-ink">{r.title}</p>
                          <p className="text-xs text-ink-faint">{formatDate(r.date)}</p>
                        </div>
                        <StatusPill status="Submitted" />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {on.leave && prefs.dashboard.leave && data.upcomingLeave && (
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">Upcoming Leave</h3>
                  <Link href="/leave" className="text-xs font-medium text-ink-muted hover:text-ink">Manage</Link>
                </div>
                <p className="text-sm text-ink">{data.upcomingLeave.type} leave · {data.upcomingLeave.days} working day{data.upcomingLeave.days === 1 ? "" : "s"}</p>
                <p className="mt-0.5 text-sm text-ink-faint">{formatDate(data.upcomingLeave.startDate)} – {formatDate(data.upcomingLeave.endDate)}</p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
