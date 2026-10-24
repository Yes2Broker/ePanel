"use client";

import Link from "next/link";
import { CalendarCheck, FileText, Briefcase, BadgeCheck, CalendarDays, UserRound } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/pills";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { weekOffLabel } from "@/lib/constants";
import { FEATURE_KEYS, isFeatureEnabled } from "@/lib/features";

const on = {
  attendance: isFeatureEnabled("attendance"),
  reports: isFeatureEnabled("reports"),
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
            {on.reports && (
              <SummaryCard
                icon={FileText} label="Today's Report"
                value={data.reportFiledToday ? "Filed" : "Pending"}
                note={canReport ? (data.reportFiledToday ? "Thanks — all done" : "Submit before you leave") : "Not required for you"}
                href={canReport ? "/reports" : undefined}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

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

          </div>
        </>
      )}
    </div>
  );
}
