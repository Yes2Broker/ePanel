"use client";

import { useState } from "react";
import { FileText, TrendingUp, Eye, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { ReportDraft, ReportFormDialog, ReportViewDialog } from "@/components/reports/report-dialogs";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { REPORT_MODULE, reportStatusLabel } from "@/lib/constants";
import { DailyReport, ReportStatus, ReportType } from "@/types";
import { addDays, formatDate, formatDateTime, todayISO } from "@/lib/utils";

type View = "mine" | "team";

export default function ReportsPage() {
  const { isManager, permissions } = useSession();
  const canFile = !!(permissions?.normalReport || permissions?.soleSelling);
  const [view, setView] = useState<View>(canFile ? "mine" : "team");

  return (
    <div className="space-y-6 pt-4">
      <PageHeader
        title="Daily Reports"
        subtitle={view === "team" ? "Review reports submitted by your team." : "Fill in today's report, or review past submissions."}
      />
      {isManager && canFile && (
        <Tabs value={view} onChange={setView} tabs={[{ value: "mine", label: "My reports" }, { value: "team", label: "Team reports" }]} />
      )}
      {view === "mine" && canFile && <MyReports />}
      {view === "team" && isManager && <TeamReports />}
      {!canFile && !isManager && (
        <EmptyState icon={FileText} title="Daily reports aren't enabled for you" text="Contact HR or Admin if you think this is a mistake." />
      )}
    </div>
  );
}

const TYPE_CARDS: { type: ReportType; icon: typeof FileText; text: string }[] = [
  { type: "Normal", icon: FileText, text: "Log your day-to-day activity, visits and follow-ups." },
  { type: "Sole Selling", icon: TrendingUp, text: "Log activity specific to sole-selling assigned projects." },
];

function MyReports() {
  const { permissions } = useSession();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useApi(() => api.myReports());
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [viewing, setViewing] = useState<DailyReport | null>(null);
  const [saving, setSaving] = useState(false);
  const reports = data ?? [];
  const today = todayISO();

  const startReport = (type: ReportType) => {
    // Re-open today's report of this type rather than hitting the one-per-day rule.
    const existing = reports.find((r) => r.type === type && r.date === today);
    if (existing && (existing.status === "Submitted" || existing.status === "Approved")) {
      setViewing(existing);
      return;
    }
    setDraft(existing ? { id: existing.id, type, date: existing.date, data: existing.data } : { id: null, type, date: today, data: {} });
  };

  const save = async (d: ReportDraft, submit: boolean) => {
    setSaving(true);
    try {
      const saved = await api.saveReport(d.id, d.date, d.type, d.data, submit);
      setData(d.id ? reports.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...reports].sort((a, b) => b.date.localeCompare(a.date)));
      toast(submit ? "Report submitted." : "Draft saved.");
      setDraft(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: DailyReport) => {
    if (!window.confirm("Delete this draft?")) return;
    try {
      await api.deleteReport(r.id);
      setData(reports.filter((x) => x.id !== r.id));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TYPE_CARDS.filter((c) => permissions?.[REPORT_MODULE[c.type]]).map(({ type, icon: Icon, text }) => {
          const todays = reports.find((r) => r.type === type && r.date === today);
          return (
            <Card key={type} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand">
                  <Icon className="h-4 w-4 text-ink" />
                </div>
                {todays && <StatusPill status={reportStatusLabel(todays.status)} />}
              </div>
              <h3 className="text-sm font-semibold text-ink">{type} Daily Report</h3>
              <p className="mt-1 text-sm text-ink-faint">{text}</p>
              <SecondaryButton className="mt-4" onClick={() => startReport(type)}>
                {!todays ? "Fill today's report" : todays.status === "Draft" || todays.status === "Rejected" ? "Continue today's report" : "View today's report"}
              </SecondaryButton>
            </Card>
          );
        })}
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">My Past Reports</h3>
        {loading && !data ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Date</th>
                  <th className="px-2 py-2.5">Report Type</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Last Updated</th>
                  <th className="px-2 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const editable = r.status === "Draft" || r.status === "Rejected";
                  return (
                    <tr key={r.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                      <td className="px-2 py-2.5 text-ink">{formatDate(r.date)}</td>
                      <td className="px-2 py-2.5 text-ink-muted">{r.type}</td>
                      <td className="px-2 py-2.5">
                        <StatusPill status={reportStatusLabel(r.status)} />
                        {r.reviewNote && <p className="mt-0.5 max-w-xs truncate text-xs text-ink-faint">“{r.reviewNote}”</p>}
                      </td>
                      <td className="px-2 py-2.5 text-ink-faint">{formatDateTime(r.updatedAt)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setViewing(r)} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted" aria-label="View report"><Eye className="h-3.5 w-3.5" /></button>
                          {editable && permissions?.[REPORT_MODULE[r.type]] && (
                            <button onClick={() => setDraft({ id: r.id, type: r.type, date: r.date, data: r.data })} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted" aria-label="Edit report"><Pencil className="h-3.5 w-3.5" /></button>
                          )}
                          {r.status === "Draft" && (
                            <button onClick={() => remove(r)} className="rounded-lg p-1.5 text-ink-faint hover:bg-status-dangerBg hover:text-status-danger" aria-label="Delete draft"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {reports.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-10 text-center text-sm text-ink-faint">No reports yet — fill in today&apos;s above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ReportFormDialog draft={draft} onClose={() => setDraft(null)} onSave={save} saving={saving} />
      <ReportViewDialog report={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function TeamReports() {
  const toast = useToast();
  const { user } = useSession();
  const [from, setFrom] = useState(addDays(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<ReportStatus | "All">("Submitted");
  const { data, setData, loading, error, reload } = useApi(
    () => api.teamReports(from, to, status === "All" ? null : status),
    [from, to, status]
  );
  const [viewing, setViewing] = useState<DailyReport | null>(null);
  const [saving, setSaving] = useState(false);

  const review = async (approve: boolean, note: string) => {
    if (!viewing) return;
    setSaving(true);
    try {
      const updated = await api.reviewReport(viewing.id, approve, note);
      setData((data ?? []).map((r) => (r.id === updated.id ? updated : r)).filter((r) => status === "All" || r.status === status));
      toast(approve ? "Report approved." : "Report sent back with your feedback.");
      setViewing(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={selectCls} aria-label="From date" />
        <span className="text-sm text-ink-faint">to</span>
        <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => e.target.value && setTo(e.target.value)} className={selectCls} aria-label="To date" />
        <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatus | "All")} className={selectCls}>
          <option value="Submitted">Awaiting review</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Sent back</option>
          <option value="All">All</option>
        </select>
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length === 0 ? (
        <EmptyState icon={FileText} title="No reports in this range" />
      ) : (
        <Card className="overflow-hidden p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Employee</th>
                  <th className="px-2 py-2.5">Date</th>
                  <th className="px-2 py-2.5">Type</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5">Submitted</th>
                  <th className="px-2 py-2.5 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.employeeName} />
                        <span className="font-medium text-ink">{r.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-ink-muted">{formatDate(r.date)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{r.type}</td>
                    <td className="px-2 py-2.5"><StatusPill status={reportStatusLabel(r.status)} /></td>
                    <td className="px-2 py-2.5 text-ink-faint">{formatDateTime(r.submittedAt)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button onClick={() => setViewing(r)} className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-ink/90">
                        {r.status === "Submitted" && r.employeeId !== user?.id ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <ReportViewDialog
        report={viewing}
        onClose={() => setViewing(null)}
        onReview={viewing && viewing.employeeId !== user?.id ? review : undefined}
        saving={saving}
      />
    </>
  );
}
