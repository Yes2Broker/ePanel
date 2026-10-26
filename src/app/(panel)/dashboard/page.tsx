"use client";

import Link from "next/link";
import { CalendarCheck, FileText, Briefcase, BadgeCheck, CalendarDays, UserRound, CalendarOff, Clock, Hourglass } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { AttUpdateBanner } from "@/components/attendance/att-update-banner";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { InstallBanner } from "@/components/pwa/install-banner";
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
  leave: isFeatureEnabled("leave"),
};
const anyFeatureOn = FEATURE_KEYS.some(isFeatureEnabled);

export default function EmployeeDashboardPage() {
  const { user, permissions } = useSession();
  const { prefs } = usePreferences();
  // Everything this call returns belongs to a feature, so skip it while they're all off.
  const { data, loading, error, reload } = useApi(() => (anyFeatureOn ? api.employeeDashboard() : Promise.resolve(null)));
  const leave = useApi(() => (on.leave ? api.leaveDashboard() : Promise.resolve(null)));
  const att = useApi(() => (on.attendance ? api.attDashboard() : Promise.resolve(null)));
  const mine = att.data?.mine;
  if (!user) return null;

  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const canReport = !!(permissions?.normalReport || permissions?.soleSelling);

  return (
    <div className="space-y-4 pt-1 md:space-y-6 md:pt-4">
      <PageHeader title={`${greeting}, ${firstName} 👋`} subtitle="Welcome to your Yes2Broker panel." />
      <InstallBanner />
      {on.attendance && <AttUpdateBanner where="dashboard" />}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <SummaryCard icon={BadgeCheck} label="Employee ID" value={user.id} />
        <SummaryCard icon={Briefcase} label="Department" value={user.department} note={user.designation || undefined} />
        <SummaryCard icon={CalendarDays} label="Weekly Off" value={weekOffLabel(user.weekOff)} />
        <SummaryCard icon={UserRound} label="Reporting To" value={user.manager || "—"} href="/profile" />
        {on.leave && permissions?.leave && leave.data && (
          <SummaryCard
            icon={CalendarOff} label="Next leave"
            value={leave.data.nextLeave ? formatDate(leave.data.nextLeave.start, { weekday: true }) : "None"}
            note={[
              leave.data.nextLeave && `${Number(leave.data.nextLeave.days.toFixed(1))} day${leave.data.nextLeave.days === 1 ? "" : "s"}`,
              leave.data.myPending ? `${leave.data.myPending} pending` : !leave.data.nextLeave && "Nothing planned",
            ].filter(Boolean).join(" · ")}
            href="/leave"
          />
        )}
      </div>

      <ComingSoonCard />

      <ErrorBanner message={error} onRetry={reload} />
      {anyFeatureOn && loading && !data && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            {/* This month's attendance, once HR has uploaded some days. */}
            {on.attendance && mine && mine.days > 0 && (
              <>
                <SummaryCard icon={CalendarCheck} label="Payable days" value={Number(mine.netPayable.toFixed(1))}
                  note={`this month, till ${formatDate(mine.lastDay)}`} href="/attendance" />
                <SummaryCard icon={Clock} label="Lates" value={mine.lates}
                  note={mine.lateDeduction ? `${mine.lateDeduction} day deducted` : "first 2 are free"} href="/attendance" />
                <SummaryCard icon={Hourglass} label="Short days" value={mine.shortDays}
                  note={mine.shortDays ? `${mine.shortDays * 0.5} day deducted` : "under 8 hours"} href="/attendance" />
              </>
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
