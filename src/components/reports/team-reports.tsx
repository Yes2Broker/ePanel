"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { ErrorBanner, Loading, selectCls } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportTotals, SalesReportType } from "@/types";
import { cn, formatDate, todayISO } from "@/lib/utils";

type Period = "today" | "mtd";
const LEGEND = "FL Fresh Leads · CM Calls Made · P Positive · SVS Site Visit Scheduled · SVD Site Visit Done · WI Walk In · B Bookings · VC% Done ÷ Calls · CC% Bookings ÷ Done";
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

/** No report that day: why, if they were off (leave or weekly off), else "not filed". */
function NotFiled({ off }: { off?: string | null }) {
  // A half day still means a report is expected.
  if (off && off !== "Half-day leave") return <span className="text-xs font-normal text-ink-faint">{off}</span>;
  return <span className="text-xs font-normal text-status-danger">not filed{off ? ` · ${off.toLowerCase()}` : ""}</span>;
}

/** One person's (or the total's) numbers as a labelled 3-column grid — the phone version of a table row. */
function TotalsGrid({ t, cols, dim }: { t: ReportTotals; cols: typeof COLS; dim?: boolean }) {
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
      {cols.map((c) => (
        <div key={c.key} className="min-w-0">
          <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint" title={c.title}>{c.label}</dt>
          <dd className={cn("text-sm font-semibold", dim ? "text-ink-faint" : "text-ink")}>{t[c.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Summary tab: Day / MTD totals per person and report, with filters. */
export function TeamSummary() {
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<SalesReportType | "">("");
  const [projectId, setProjectId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const projects = useApi(() => api.listProjects());
  const employees = useApi(() => api.listEmployees());
  const filters = { type: type || null, projectId: projectId || null, employeeId: employeeId || null };
  const summary = useApi(() => api.teamReportSummary({ date, ...filters }), [date, type, projectId, employeeId]);

  const chips = [
    type && { label: type, clear: () => { setType(""); setProjectId(""); } },
    projectId && { label: (projects.data ?? []).find((p) => p.id === projectId)?.name ?? "Project", clear: () => setProjectId("") },
    employeeId && { label: (employees.data ?? []).find((e) => e.id === employeeId)?.name ?? "Person", clear: () => setEmployeeId("") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const filterFields = (
    <>
      <label className="block text-xs text-ink-muted">Type
        <select value={type} onChange={(e) => { setType(e.target.value as SalesReportType | ""); if (e.target.value === "Normal") setProjectId(""); }} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
          <option value="">All reports</option><option value="Normal">Normal</option><option value="Sole Selling">Sole Selling</option>
        </select>
      </label>
      <label className="block text-xs text-ink-muted">Project
        <select value={projectId} disabled={type === "Normal"} onChange={(e) => setProjectId(e.target.value)} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
          <option value="">All projects</option>
          {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "Closed" ? " (closed)" : ""}</option>)}
        </select>
      </label>
      <label className="block text-xs text-ink-muted">Person
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={cn(selectCls, "mt-1 block w-full md:w-auto")}>
          <option value="">Everyone</option>
          {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === "Inactive" ? " (inactive)" : ""}</option>)}
        </select>
      </label>
    </>
  );

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Phones: Filters button + chips. Tablet/desktop: the filters inline. */}
      <div className="space-y-2 md:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryButton onClick={() => setFiltersOpen(true)} className="min-h-10 whitespace-nowrap px-3">
            <SlidersHorizontal className="h-4 w-4" /> Filters{chips.length ? ` (${chips.length})` : ""}
          </SecondaryButton>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c.label} onClick={c.clear} className="flex min-h-8 max-w-full items-center gap-1 rounded-full bg-brand-soft px-3 text-xs font-medium text-brand" aria-label={`Remove filter ${c.label}`}>
                <span className="truncate">{c.label}</span> <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
      <Card className="hidden flex-wrap items-end gap-2.5 p-4 md:flex">
        {filterFields}
      </Card>
      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" size="sm"
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton className="justify-center" onClick={() => { setType(""); setProjectId(""); setEmployeeId(""); }}>Clear</SecondaryButton>
          <PrimaryButton className="justify-center" onClick={() => setFiltersOpen(false)}>Apply</PrimaryButton>
        </div>}>
        <div className="space-y-3">{filterFields}</div>
      </Modal>

      {/* ---- Today / MTD totals ---- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            Totals
            <button onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen} aria-label="What the short names mean"
              className="-my-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-faint hover:bg-white hover:text-ink-muted md:hidden">
              <Info className="h-4 w-4" />
            </button>
          </h2>
          <div className="flex min-w-0 items-center gap-2">
            <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Totals date" className={cn(selectCls, "w-[9.5rem] min-w-0 px-2.5 text-sm")} />
            <div className="flex shrink-0 rounded-full bg-white p-0.5 shadow-card" role="tablist">
              {([["today", "Day"], ["mtd", "MTD"]] as [Period, string][]).map(([v, l]) => (
                <button key={v} role="tab" aria-selected={period === v} aria-label={v === "today" ? formatDate(date, { weekday: true }) : "MTD"} onClick={() => setPeriod(v)}
                  className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium", period === v ? "bg-ink text-white" : "text-ink-muted")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        {legendOpen && <p className="rounded-xl bg-white p-3 text-xs leading-relaxed text-ink-muted md:hidden">{LEGEND}</p>}
        <ErrorBanner message={summary.error} onRetry={summary.reload} />
        {summary.loading && !summary.data ? <Loading /> : (summary.data ?? []).map((g) => {
          const cols = COLS.filter((c) => c.key !== "walkIn" || g.type === "Sole Selling");
          return (
            <Card key={`${g.type}-${g.projectId}`} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
                <h3 className="min-w-0 break-words text-sm font-semibold text-ink">{g.title}</h3>
                <span className="shrink-0 pl-2 text-xs text-ink-faint">{period === "today" ? `${g.rows.filter((r) => r.filedToday).length} filed` : `1–${Number(date.slice(8))} ${formatDate(date).split(" ")[1]}`}</span>
              </div>

              {/* Phones: a card per person, then the total. */}
              <ul className="divide-y divide-surface-border md:hidden">
                {g.rows.map((r) => {
                  const dim = period === "today" && !r.filedToday;
                  return (
                    <li key={r.employeeId} className="space-y-2 px-4 py-3">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink">
                        <span className="break-words">{r.employeeName}</span>
                        {dim && <NotFiled off={r.off} />}
                      </p>
                      <TotalsGrid t={r[period]} cols={cols} dim={dim} />
                    </li>
                  );
                })}
                {g.rows.length === 0 && <li className="px-4 py-5 text-sm text-ink-faint">No reports this month.</li>}
                <li className="space-y-2 bg-brand-soft px-4 py-3">
                  <p className="text-sm font-semibold text-brand">Total</p>
                  <TotalsGrid t={g.totals[period]} cols={cols} />
                </li>
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface text-xs text-ink-faint">
                      <th className="px-4 py-2 text-left font-medium">Name</th>
                      {cols.map((c) => <th key={c.key} title={c.title} className="px-2 py-2 text-center font-medium">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const t = r[period];
                      const dim = period === "today" && !r.filedToday;
                      return (
                        <tr key={r.employeeId} className="border-t border-surface-border">
                          <td className="px-4 py-2 font-medium text-ink">
                            {r.employeeName}{dim && <span className="ml-1.5"><NotFiled off={r.off} /></span>}
                          </td>
                          {cols.map((c) => <td key={c.key} className={cn("px-2 py-2 text-center", dim ? "text-ink-faint" : "text-ink")}>{t[c.key]}</td>)}
                        </tr>
                      );
                    })}
                    {g.rows.length === 0 && <tr><td colSpan={cols.length + 1} className="px-4 py-6 text-center text-ink-faint">No reports this month.</td></tr>}
                    <tr className="border-t-2 border-ink/10 bg-brand-soft font-semibold">
                      <td className="px-4 py-2 text-ink">Total</td>
                      {cols.map((c) => <td key={c.key} className="px-2 py-2 text-center text-ink">{g.totals[period][c.key]}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
        <p className="hidden text-xs text-ink-faint md:block">{LEGEND}</p>
      </section>

    </div>
  );
}

export function FileForSomeone({ open, onClose, employees, projects }: {
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
