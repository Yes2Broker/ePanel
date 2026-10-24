"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { ErrorBanner, Loading, Tabs, selectCls } from "@/components/ui/page";
import { ReportSummaryById } from "@/components/reports/report-summary";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportTotals, SalesReportType } from "@/types";
import { cn, formatDate, todayISO } from "@/lib/utils";

type Period = "today" | "mtd";
const COLS: { key: keyof ReportTotals; label: string; title: string }[] = [
  { key: "leads", label: "FL", title: "Fresh Leads" },
  { key: "calls", label: "CM", title: "Calls Made" },
  { key: "positive", label: "P", title: "Positive" },
  { key: "scheduled", label: "SVS", title: "Site Visit Scheduled" },
  { key: "done", label: "SVD", title: "Site Visit Done" },
  { key: "walkIn", label: "WI", title: "Walk In" },
  { key: "tokens", label: "B", title: "Bookings / Tokens" },
  { key: "siteVisitConversion", label: "VC%", title: "Site Visit Conversion" },
  { key: "closureConversion", label: "CC%", title: "Closure Conversion" },
];

export function TeamReports() {
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<SalesReportType | "">("");
  const [projectId, setProjectId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [openId, setOpenId] = useState<string | null>(null);
  const [fileOpen, setFileOpen] = useState(false);

  const projects = useApi(() => api.listProjects());
  const employees = useApi(() => api.listEmployees());
  const filters = { type: type || null, projectId: projectId || null, employeeId: employeeId || null };
  const summary = useApi(() => api.teamReportSummary({ date, ...filters }), [date, type, projectId, employeeId]);
  const list = useApi(() => api.listSalesReports({ from, to, ...filters }), [from, to, type, projectId, employeeId]);

  return (
    <div className="space-y-5">
      <Card className="grid grid-cols-1 gap-2.5 p-4 min-[480px]:grid-cols-2 md:flex md:flex-wrap md:items-end">
        <label className="text-xs text-ink-muted">Type
          <select value={type} onChange={(e) => { setType(e.target.value as SalesReportType | ""); if (e.target.value === "Normal") setProjectId(""); }} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
            <option value="">All reports</option><option value="Normal">Normal</option><option value="Sole Selling">Sole Selling</option>
          </select>
        </label>
        <label className="text-xs text-ink-muted">Project
          <select value={projectId} disabled={type === "Normal"} onChange={(e) => setProjectId(e.target.value)} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "Closed" ? " (closed)" : ""}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-muted">Person
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
            <option value="">Everyone</option>
            {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === "Inactive" ? " (inactive)" : ""}</option>)}
          </select>
        </label>
        <div className="md:ml-auto">
          <PrimaryButton onClick={() => setFileOpen(true)} className="w-full justify-center md:w-auto"><Plus className="h-4 w-4" /> File for someone</PrimaryButton>
        </div>
      </Card>

      {/* ---- Today / MTD totals ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Totals</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Totals date" className={selectCls} />
            <Tabs value={period} onChange={setPeriod} tabs={[{ value: "today", label: formatDate(date, { weekday: true }) }, { value: "mtd", label: "MTD" }]} />
          </div>
        </div>
        <ErrorBanner message={summary.error} onRetry={summary.reload} />
        {summary.loading && !summary.data ? <Loading /> : (summary.data ?? []).map((g) => {
          const cols = COLS.filter((c) => c.key !== "walkIn" || g.type === "Sole Selling");
          return (
            <Card key={`${g.type}-${g.projectId}`} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
                <h3 className="min-w-0 truncate text-sm font-semibold text-ink">{g.title}</h3>
                <span className="shrink-0 pl-2 text-xs text-ink-faint">{period === "today" ? `${g.rows.filter((r) => r.filedToday).length} filed` : `1–${Number(date.slice(8))} ${formatDate(date).split(" ")[1]}`}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="bg-surface text-xs text-ink-faint">
                      <th className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left font-medium shadow-[1px_0_0_theme(colors.surface.border)] sm:px-4">Name</th>
                      {cols.map((c) => <th key={c.key} title={c.title} className="px-2 py-2 text-center font-medium">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const t = r[period];
                      const dim = period === "today" && !r.filedToday;
                      return (
                        <tr key={r.employeeId} className="border-t border-surface-border">
                          <td className="sticky left-0 z-[1] max-w-[9rem] bg-white px-3 py-2 font-medium text-ink shadow-[1px_0_0_theme(colors.surface.border)] sm:max-w-none sm:px-4">
                            <span className="block truncate sm:inline">{r.employeeName}</span>{dim && <span className="block text-xs font-normal text-status-danger sm:ml-1.5 sm:inline">not filed</span>}
                          </td>
                          {cols.map((c) => <td key={c.key} className={cn("px-2 py-2 text-center", dim ? "text-ink-faint" : "text-ink")}>{t[c.key]}</td>)}
                        </tr>
                      );
                    })}
                    {g.rows.length === 0 && <tr><td colSpan={cols.length + 1} className="sticky left-0 px-4 py-6 text-left text-ink-faint sm:static sm:text-center">No reports this month.</td></tr>}
                    <tr className="border-t-2 border-ink/10 bg-brand-soft font-semibold">
                      <td className="sticky left-0 z-[1] bg-brand-soft px-3 py-2 text-ink shadow-[1px_0_0_theme(colors.surface.border)] sm:px-4">Total</td>
                      {cols.map((c) => <td key={c.key} className="px-2 py-2 text-center text-ink">{g.totals[period][c.key]}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
        <p className="text-xs text-ink-faint">FL Fresh Leads · CM Calls Made · P Positive · SVS Site Visit Scheduled · SVD Site Visit Done · WI Walk In · B Bookings · VC% Done ÷ Calls · CC% Bookings ÷ Done</p>
      </section>

      {/* ---- Individual reports ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Reports</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-faint">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" className={selectCls} />
            to
            <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" className={selectCls} />
          </div>
        </div>
        <ErrorBanner message={list.error} onRetry={list.reload} />
        <Card className="overflow-hidden p-0">
          {list.loading && !list.data ? <Loading /> : (list.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">No reports in this range.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {(list.data ?? []).map((r) => (
                <li key={r.id}>
                  <button onClick={() => setOpenId(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-ink">{r.employeeName} <span className="font-normal text-ink-faint">· {r.title}</span></p>
                      <p className="text-xs text-ink-faint">{formatDate(r.date, { weekday: true })} · FL {r.leads} · CM {r.calls} · P {r.positive} · SVS {r.scheduled} · SVD {r.done}{r.type === "Sole Selling" ? ` · WI ${r.walkIn}` : ""} · B {r.tokens}{r.source === "import" ? " · imported" : ""}{r.updatedAt ? " · edited" : ""}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {openId && <ReportSummaryById reportId={openId} isManager onClose={() => { setOpenId(null); list.reload(); summary.reload(); }} />}
      <FileForSomeone open={fileOpen} onClose={() => setFileOpen(false)} employees={employees.data ?? []} projects={projects.data ?? []} />
    </div>
  );
}

function FileForSomeone({ open, onClose, employees, projects }: {
  open: boolean; onClose: () => void;
  employees: { id: string; name: string; status: string }[]; projects: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [report, setReport] = useState("normal");
  const [date, setDate] = useState(todayISO());
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    const [kind, project] = report.split(":");
    router.push(`/reports/fill?type=${kind}${project ? `&project=${project}` : ""}&date=${date}&employee=${employeeId}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="File a report for someone">
      <form onSubmit={go} className="space-y-4">
        <Field label="Employee">
          <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            <option value="">Select employee</option>
            {employees.filter((e) => e.status === "Active").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Report">
          <select value={report} onChange={(e) => setReport(e.target.value)} className={inputCls}>
            <option value="normal">Normal Daily Report</option>
            {projects.filter((p) => p.status === "Active").map((p) => <option key={p.id} value={`sole:${p.id}`}>Sole Selling – {p.name}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" required value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-xs text-ink-faint">If that day is already filed, it opens so you can edit it instead.</p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <SecondaryButton type="button" onClick={onClose} className="justify-center">Cancel</SecondaryButton>
          <PrimaryButton type="submit" className="justify-center">Continue</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
