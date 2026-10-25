"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, TrendingUp, CheckCircle2, ChevronRight, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs } from "@/components/ui/page";
import { ReportSummaryById } from "@/components/reports/report-summary";
import { TeamReports } from "@/components/reports/team-reports";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { ProjectsPanel } from "@/components/reports/projects-panel";
import { EmailSettings } from "@/components/reports/email-settings";
import { StaleVisits } from "@/components/reports/stale-visits";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportOption } from "@/types";
import { formatDate, todayISO } from "@/lib/utils";

type Tab = "mine" | "team" | "visits" | "projects" | "email";

function ReportsInner() {
  const { user, isManager } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  const isAdmin = user?.role === "Admin";
  const options = useApi(() => api.reportOptions());
  const canFile = (options.data?.length ?? 0) > 0;

  const tabs: { value: Tab; label: string; short?: string }[] = [
    ...(canFile || !isManager ? [{ value: "mine" as Tab, label: "My reports", short: "Mine" }] : []),
    ...(isManager ? [{ value: "team" as Tab, label: "Team" }, { value: "visits" as Tab, label: "Old visits", short: "Old visits" }, { value: "projects" as Tab, label: "Projects" }] : []),
    ...(isAdmin ? [{ value: "email" as Tab, label: "10 PM email", short: "Email" }] : []),
  ];
  const requested = q.get("tab") as Tab | null;
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested
    : options.loading && !options.data ? (isManager ? "team" : "mine") : tabs[0]?.value ?? "mine";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`);
  const openId = q.get("open");

  return (
    <div className="space-y-4 pt-2 md:space-y-5 md:pt-4">
      <PageHeader
        title="Daily Reports"
        subtitle={tab === "team" ? "Your team's reports, with today and month-to-date totals." : tab === "projects" ? "Sole selling projects." : tab === "visits" ? "Close old imported visits that were never marked." : tab === "email" ? "Who gets the 10 PM report emails." : "File today's report and look back at past ones."}
        actions={isAdmin && (
          <>
            <div className="md:hidden"><OverflowMenu items={[{ href: "/reports/import", label: "Import old data", icon: Upload }]} /></div>
            <Link href="/reports/import" className="hidden min-h-10 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface md:inline-flex">
              <Upload className="h-4 w-4" /> Import old data
            </Link>
          </>
        )}
      />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === "mine" && <MyReports options={options.data} loading={options.loading} error={options.error} reload={options.reload} />}
      {tab === "team" && isManager && <TeamReports />}
      {tab === "visits" && isManager && <StaleVisits />}
      {tab === "projects" && isManager && <ProjectsPanel />}
      {tab === "email" && isAdmin && <EmailSettings />}
      {openId && (
        <ReportSummaryById reportId={openId} isManager={isManager} onClose={() => router.replace(`${pathname}${tab ? `?tab=${tab}` : ""}`)} />
      )}
    </div>
  );
}

function MyReports({ options, loading, error, reload }: { options: ReportOption[] | null; loading: boolean; error: string; reload: () => void }) {
  const { isManager } = useSession();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const past = useApi(() => api.mySalesReports(`${month}-01`), [month]);
  const [openId, setOpenId] = useState<string | null>(null);

  // Refresh "filed today" after coming back from the form.
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (loading && !options) return <Loading />;
  if (options && options.length === 0) {
    return <EmptyState icon={FileText} title="No daily reports assigned to you" text="Ask HR or Admin to give you access to the Normal or Sole Selling report." />;
  }
  return (
    <>
      <ErrorBanner message={error} onRetry={reload} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(options ?? []).map((o) => {
          const href = o.todayReportId ? `/reports?open=${o.todayReportId}`
            : `/reports/fill?type=${o.type === "Normal" ? "normal" : "sole"}${o.projectId ? `&project=${o.projectId}` : ""}`;
          const Icon = o.type === "Normal" ? FileText : TrendingUp;
          return (
            <Link key={`${o.type}-${o.projectId}`} href={href} className="block rounded-card focus:outline-none focus:ring-2 focus:ring-brand">
              <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-surface">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft"><Icon className="h-4 w-4 text-brand" /></div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-ink sm:text-base">{o.title}</p>
                  {o.todayReportId
                    ? <p className="flex items-center gap-1 text-sm text-status-success"><CheckCircle2 className="h-3.5 w-3.5" /> Filed today — tap to view</p>
                    : <p className="text-sm text-ink-faint">Not filed today — tap to fill</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">My past reports</h3>
          <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month"
            className="min-h-10 min-w-0 max-w-full rounded-pill border border-surface-border bg-white px-3 py-1.5 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm" />
        </div>
        <ErrorBanner message={past.error} onRetry={past.reload} />
        {past.loading && !past.data ? <Loading /> : (past.data ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">No reports this month.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {(past.data ?? []).map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpenId(r.id)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left hover:bg-surface">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{formatDate(r.date, { weekday: true })} · {r.title}</p>
                    <p className="text-xs text-ink-faint">Calls {r.calls} · Positive {r.positive} · Done {r.done} · Tokens {r.tokens}{r.canEdit ? " · editable" : ""}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {openId && <ReportSummaryById reportId={openId} isManager={isManager} onClose={() => { setOpenId(null); past.reload(); }} />}
    </>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<Loading />}><ReportsInner /></Suspense>;
}
