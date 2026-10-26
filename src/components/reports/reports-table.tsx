"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorBanner, Loading, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportOption, SalesReportRow } from "@/types";
import { cn, formatDate, formatDateTime, todayISO } from "@/lib/utils";
import { HistoryPanel, ReportSummaryById } from "@/components/reports/report-summary";
import { FileForSomeone } from "@/components/reports/team-reports";

const EDIT_CLOSED = "Editing closed after 24 hours";

/** Where an option leads: the new-report form, or today's report to edit. */
const optionHref = (o: ReportOption) => o.todayReportId ? `/reports/edit/${o.todayReportId}`
  : `/reports/fill?type=${o.type === "Normal" ? "normal" : "sole"}${o.projectId ? `&project=${o.projectId}` : ""}`;
const optionTitle = (o: ReportOption) => (o.type === "Normal" ? "Normal report" : `Sole Selling · ${o.projectName}`);
const optionLine = (o: ReportOption) => (o.todayReportId ? "Filed today – tap to edit" : o.type === "Normal" ? "Leads, calls and visits" : "Project report");

/**
 * "+ New report". One report: opens it straight away. More: a small menu.
 * Already filed today: opens that report to edit.
 */
export function NewReportButton({ options }: { options: ReportOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const btn = "inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-pill bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90";
  if (options.length === 1) {
    return <Link href={optionHref(options[0])} className={btn}><Plus className="h-4 w-4" /> New report</Link>;
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={btn}>
        <Plus className="h-4 w-4" /> New report <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-surface-border bg-white p-1 shadow-lg">
          {options.map((o) => (
            <Link key={`${o.type}-${o.projectId}`} href={optionHref(o)} role="menuitem" onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 hover:bg-surface">
              <span className="block break-words text-sm font-semibold text-ink">{optionTitle(o)}</span>
              <span className={cn("block text-xs", o.todayReportId ? "text-status-success" : "text-ink-faint")}>{optionLine(o)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const iconBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint hover:bg-surface hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** View · Edit · History (· Delete for Admin) for one report. */
function Actions({ r, canEdit, canDelete, onView, onHistory, onDelete, big }: {
  r: SalesReportRow; canEdit: boolean; canDelete: boolean; onView: () => void; onHistory: () => void; onDelete: () => void; big?: boolean;
}) {
  const cls = cn(iconBtn, big && "h-11 w-11");
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={onView} className={cls} title="View" aria-label={`View ${r.title}, ${formatDate(r.date)}`}><Eye className="h-4 w-4" /></button>
      {canEdit ? (
        <Link href={`/reports/edit/${r.id}`} className={cls} title="Edit" aria-label={`Edit ${r.title}, ${formatDate(r.date)}`}><Pencil className="h-4 w-4" /></Link>
      ) : (
        <span title={EDIT_CLOSED}><button disabled className={cls} aria-label={EDIT_CLOSED}><Pencil className="h-4 w-4" /></button></span>
      )}
      <button onClick={onHistory} className={cls} title="History" aria-label={`History of ${r.title}, ${formatDate(r.date)}`}><Clock className="h-4 w-4" /></button>
      {canDelete && (
        <button onClick={onDelete} className={cn(cls, "hover:text-status-danger")} title="Delete" aria-label={`Delete ${r.title}, ${formatDate(r.date)}`}><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}

type Period = "month" | "range";

/**
 * The reports list. `manager` (HR/Admin): everyone, with person / report /
 * month-or-range filters; otherwise the signed-in person's own reports.
 */
export function ReportsTable({ manager }: { manager: boolean }) {
  const { user } = useSession();
  const toast = useToast();
  const isAdmin = user?.role === "Admin";
  const [period, setPeriod] = useState<Period>("month");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [person, setPerson] = useState("");
  const [report, setReport] = useState(""); // "" | "normal" | "sole" | "sole:<projectId>"
  const [viewId, setViewId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SalesReportRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);

  const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
  const range = period === "month" ? { from: `${month}-01`, to: monthEnd(month) } : { from, to };
  const [kind, projectId] = report.split(":");
  const people = useApi(() => (manager ? api.listEmployees() : Promise.resolve(null)), [manager]);
  const projects = useApi(() => (manager ? api.listProjects() : Promise.resolve(null)), [manager]);
  const list = useApi(() => manager
    ? api.listSalesReports({ from: range.from, to: range.to, type: kind === "normal" ? "Normal" : kind === "sole" ? "Sole Selling" : null, projectId: projectId || null, employeeId: person || null })
    : api.mySalesReports(`${month}-01`), [manager, range.from, range.to, person, report, month]);

  const rows = list.data ?? [];
  const canEdit = (r: SalesReportRow) => manager || !!r.canEdit;

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteSalesReport(deleting.id);
      toast("Report deleted. It's kept in the history.");
      setDeleting(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const cols = ["Date", ...(manager ? ["Name"] : []), "Report", "Leads", "Calls", "Visits done", "Tokens", ...(manager ? ["Submitted at"] : []), ""];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {manager && (
          <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
            {([["month", "Month"], ["range", "Dates"]] as [Period, string][]).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={period === v} onClick={() => setPeriod(v)}
                className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium", period === v ? "bg-ink text-white" : "text-ink-muted")}>{l}</button>
            ))}
          </div>
        )}
        {period === "month" ? (
          <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" className={cn(selectCls, "min-w-0")} />
        ) : (
          <>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" className={cn(selectCls, "min-w-0")} />
            <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" className={cn(selectCls, "min-w-0")} />
          </>
        )}
        {manager && (
          <>
            <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person" className={selectCls}>
              <option value="">Everyone</option>
              {(people.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === "Inactive" ? " (inactive)" : ""}</option>)}
            </select>
            <select value={report} onChange={(e) => setReport(e.target.value)} aria-label="Report" className={selectCls}>
              <option value="">All reports</option>
              <option value="normal">Normal</option>
              <option value="sole">Sole Selling (all projects)</option>
              {(projects.data ?? []).map((p) => <option key={p.id} value={`sole:${p.id}`}>Sole Selling · {p.name}{p.status === "Closed" ? " (closed)" : ""}</option>)}
            </select>
            <SecondaryButton onClick={() => setFileOpen(true)} className="min-h-10 sm:ml-auto"><Plus className="h-4 w-4" /> File for someone</SecondaryButton>
          </>
        )}
      </div>

      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Loading /> : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No reports" text={manager ? "Nothing matches these filters." : "No reports this month."} />
      ) : (
        <>
          {/* Phones: one card per report, same buttons. */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-ink">{formatDate(r.date, { weekday: true })}{manager && <span className="font-normal text-ink-muted"> · {r.employeeName}</span>}</p>
                    <p className="break-words text-xs text-ink-muted">{r.title}{r.source === "import" ? " · imported" : ""}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Leads {r.leads} · Calls {r.calls} · Visits done {r.done} · Tokens {r.tokens}</p>
                {manager && <p className="text-xs text-ink-faint">Submitted {formatDateTime(r.submittedAt)}</p>}
                <div className="-mb-1 mt-1">
                  <Actions r={r} big canEdit={canEdit(r)} canDelete={isAdmin && manager} onView={() => setViewId(r.id)} onHistory={() => setHistoryId(r.id)} onDelete={() => setDeleting(r)} />
                </div>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  {cols.map((c, i) => <th key={i} className={cn("px-3 py-2.5 font-medium", ["Leads", "Calls", "Visits done", "Tokens"].includes(c) ? "text-right" : "text-left")}>{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date, { weekday: true })}</td>
                    {manager && <td className="whitespace-nowrap px-3 py-2">{r.employeeName}</td>}
                    <td className="px-3 py-2">{r.title}{r.source === "import" && <span className="text-xs text-ink-faint"> · imported</span>}</td>
                    <td className="px-3 py-2 text-right">{r.leads}</td>
                    <td className="px-3 py-2 text-right">{r.calls}</td>
                    <td className="px-3 py-2 text-right">{r.done}</td>
                    <td className="px-3 py-2 text-right">{r.tokens}</td>
                    {manager && <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{formatDateTime(r.submittedAt)}</td>}
                    <td className="px-2 py-1"><Actions r={r} canEdit={canEdit(r)} canDelete={isAdmin && manager} onView={() => setViewId(r.id)} onHistory={() => setHistoryId(r.id)} onDelete={() => setDeleting(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {viewId && <ReportSummaryById reportId={viewId} onClose={() => { setViewId(null); list.reload(); }} />}
      {historyId && <HistoryPanel reportId={historyId} onClose={() => setHistoryId(null)} />}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete this report?" size="sm"
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton className="justify-center" onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
          <PrimaryButton className="justify-center bg-status-danger hover:bg-status-danger/90" disabled={busy} onClick={doDelete}>{busy ? "Deleting…" : "Delete"}</PrimaryButton>
        </div>}>
        {deleting && (
          <p className="text-sm text-ink-muted">
            <b className="font-medium text-ink">{deleting.employeeName}</b> · {deleting.title} · {formatDate(deleting.date, { weekday: true })}.
            It disappears from every list, total and the daily email, but stays in the database and its history.
          </p>
        )}
      </Modal>
      {manager && <FileForSomeone open={fileOpen} onClose={() => setFileOpen(false)} employees={people.data ?? []} projects={projects.data ?? []} />}
    </div>
  );
}
