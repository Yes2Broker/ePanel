"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, FileText, CalendarOff, Clock, Hourglass, BarChart3 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { DashboardGrid, Section } from "@/components/dashboard/dashboard-grid";
import { CustomiseButton, CustomisePanel, DashboardEmpty, useDashboardLayout } from "@/components/dashboard/customise";
import { AttUpdateBanner } from "@/components/attendance/att-update-banner";
import { ComingSoonCard } from "@/components/feature/coming-soon";
import { InstallBanner } from "@/components/pwa/install-banner";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/pills";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate } from "@/lib/utils";
import { FEATURE_KEYS, isFeatureEnabled } from "@/lib/features";
import { SavedDashboard } from "@/types";

const on = {
  attendance: isFeatureEnabled("attendance"),
  reports: isFeatureEnabled("reports"),
  leave: isFeatureEnabled("leave"),
};
const anyFeatureOn = FEATURE_KEYS.some(isFeatureEnabled);

// Someone who turned "Recent reports" off under the old Settings → Dashboard
// sections keeps it off until they customise the dashboard.
function oldSettingsLayout(available: string[]): SavedDashboard | null {
  try {
    if (JSON.parse(window.localStorage.getItem("y2b-preferences") ?? "{}")?.dashboard?.reports !== false) return null;
  } catch {
    return null;
  }
  return { layout: available.map((id) => ({ id, on: id !== "recentReports" })), preset: "custom" };
}

export default function EmployeeDashboardPage() {
  const { user, permissions } = useSession();
  // Everything this call returns belongs to a feature, so skip it while they're all off.
  const { data, loading, error, reload } = useApi(() => (anyFeatureOn ? api.employeeDashboard() : Promise.resolve(null)));
  const leave = useApi(() => (on.leave ? api.leaveDashboard() : Promise.resolve(null)));
  const att = useApi(() => (on.attendance ? api.attDashboard() : Promise.resolve(null)));
  const mine = att.data?.mine;
  const canReport = !!(permissions?.normalReport || permissions?.soleSelling);

  // Only what this person's role, permissions and launched features allow.
  const available = [
    on.attendance && "attBanner",
    on.reports && "todayReport",
    on.leave && permissions?.leave && "nextLeave",
    on.attendance && "payable", on.attendance && "lates", on.attendance && "short",
    on.reports && canReport && "monthReports",
    on.reports && canReport && "recentReports",
  ].filter(Boolean) as string[];
  const [fallback] = useState(() => (typeof window === "undefined" ? null : oldSettingsLayout(available)));
  const dash = useDashboardLayout("employee", available, fallback);
  const [customising, setCustomising] = useState(false);
  if (!user) return null;

  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const hasAtt = on.attendance && mine && mine.days > 0;

  const sections: Record<string, () => Section> = {
    attBanner: () => ({ block: <AttUpdateBanner where="dashboard" /> }),
    todayReport: () => data && ({ tile: (
      <SummaryCard
        icon={FileText} label="Today's Report"
        value={data.reportFiledToday ? "Filed" : "Pending"}
        note={canReport ? (data.reportFiledToday ? "Thanks — all done" : "Submit before you leave") : "Not required for you"}
        href={canReport ? "/reports" : undefined}
      />
    ) }),
    nextLeave: () => leave.data && ({ tile: (
      <SummaryCard
        icon={CalendarOff} label="Next leave"
        value={leave.data.nextLeave ? formatDate(leave.data.nextLeave.start, { weekday: true }) : "None"}
        note={[
          leave.data.nextLeave && `${Number(leave.data.nextLeave.days.toFixed(1))} day${leave.data.nextLeave.days === 1 ? "" : "s"}`,
          leave.data.myPending ? `${leave.data.myPending} pending` : !leave.data.nextLeave && "Nothing planned",
        ].filter(Boolean).join(" · ")}
        href="/leave"
      />
    ) }),
    // This month's attendance, once HR has uploaded some days.
    payable: () => hasAtt && ({ tile: <SummaryCard icon={CalendarCheck} label="Payable days" value={Number(mine.netPayable.toFixed(1))}
      note={`this month, till ${formatDate(mine.lastDay)}`} href="/attendance" /> }),
    lates: () => hasAtt && ({ tile: <SummaryCard icon={Clock} label="Lates" value={mine.lates}
      note={mine.lateDeduction ? `${mine.lateDeduction} day deducted` : "first 2 are free"} href="/attendance" /> }),
    short: () => hasAtt && ({ tile: <SummaryCard icon={Hourglass} label="Short days" value={mine.shortDays}
      note={mine.shortDays ? `${mine.shortDays * 0.5} day deducted` : "under 8 hours"} href="/attendance" /> }),
    monthReports: () => data?.month && ({ tile: <SummaryCard icon={BarChart3} label="Reports this month" value={data.month.reports}
      note={`${data.month.leads} leads · ${data.month.calls} calls`} href="/reports" /> }),
    recentReports: () => data && ({ half: (
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
    ) }),
  };

  return (
    <div className="space-y-4 pt-1 md:space-y-6 md:pt-4">
      <PageHeader title={`${greeting}, ${firstName} 👋`} subtitle="Welcome to your Yes2Broker panel."
        actions={available.length > 0 && <CustomiseButton onClick={() => setCustomising(true)} />} />
      <InstallBanner />
      <ComingSoonCard />
      <ErrorBanner message={error} onRetry={reload} />

      {available.length > 0 && dash.shown.length === 0 ? (
        <DashboardEmpty onCustomise={() => setCustomising(true)} />
      ) : (
        <>
          <DashboardGrid sections={dash.shown.map((id) => [id, sections[id]?.()] as [string, Section])} />
          {anyFeatureOn && loading && !data && <Loading />}
        </>
      )}

      <CustomisePanel open={customising} onClose={() => setCustomising(false)} kind="employee" available={available}
        layout={dash.layout} preset={dash.preset} onChange={dash.change} onReset={dash.reset} />
    </div>
  );
}
