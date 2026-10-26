"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { EmptyState, Loading, PageHeader, Tabs } from "@/components/ui/page";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { ReportSummaryById } from "@/components/reports/report-summary";
import { ReportsTable, NewReportButton } from "@/components/reports/reports-table";
import { TeamSummary } from "@/components/reports/team-reports";
import { ProjectsPanel } from "@/components/reports/projects-panel";
import { EmailSettings } from "@/components/reports/email-settings";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Tab = "reports" | "summary" | "projects" | "email";

function ReportsInner() {
  const { user, isManager } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const isAdmin = user?.role === "Admin";
  const options = useApi(() => api.reportOptions());

  const tabs: { value: Tab; label: string }[] = isManager ? [
    { value: "summary", label: "Summary" },
    { value: "reports", label: "Reports" },
    { value: "projects", label: "Projects" },
    ...(isAdmin ? [{ value: "email" as Tab, label: "Email" }] : []),
  ] : [];
  const requested = q.get("tab") as Tab | null;
  // HR/Admin open on the Summary; employees only have their reports.
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : isManager ? "summary" : "reports";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`);
  const openId = q.get("open");
  const canFile = (options.data?.length ?? 0) > 0;

  const subtitle = {
    reports: isManager ? "Everyone's reports. View, edit or check the history of any report." : "Your daily reports. You can edit a report for 24 hours after sending it.",
    summary: "Today and month-to-date totals per person and report.",
    projects: "Sole selling projects.",
    email: "Who gets the daily report email, and when.",
  }[tab];

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader
        title="Daily Reports"
        subtitle={subtitle}
        actions={(canFile || isAdmin) && (
          <>
            {canFile && <NewReportButton options={options.data!} />}
            {isAdmin && <OverflowMenu items={[{ href: "/reports/import", label: "Import old data", icon: Upload }]} />}
          </>
        )}
      />
      {tabs.length > 0 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === "reports" && (!isManager && options.data && !canFile ? (
        <EmptyState icon={FileText} title="No daily reports assigned to you" text="Ask HR or Admin to give you access to the Normal or Sole Selling report." />
      ) : <ReportsTable manager={isManager} />)}
      {tab === "summary" && isManager && <TeamSummary />}
      {tab === "projects" && isManager && <ProjectsPanel />}
      {tab === "email" && isAdmin && <EmailSettings />}
      {openId && <ReportSummaryById reportId={openId} onClose={() => router.replace(`${pathname}${requested ? `?tab=${requested}` : ""}`)} />}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<Loading />}><ReportsInner /></Suspense>;
}
