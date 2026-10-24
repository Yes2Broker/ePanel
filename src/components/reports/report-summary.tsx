"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, History, Pencil, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { SalesReportDetail } from "@/types";
import { shortDate, time12, visitStatusLabel, whatsappUrl } from "@/lib/report-format";
import { formatDateTime } from "@/lib/utils";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
    </svg>
  );
}

/** Today vs MTD popup — the same table, lists and WhatsApp text as the old forms. */
export function ReportSummary({
  report, onClose, showHistory, editHref,
}: { report: SalesReportDetail; onClose: () => void; showHistory?: boolean; editHref?: string | null }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const sole = report.type === "Sole Selling";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !historyOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen, onClose]);
  const rows: [string, string | number, string | number][] = [
    ["Fresh Leads Received", report.today.leads, report.mtd.leads],
    ["Calls Made", report.today.calls, report.mtd.calls],
    ["Meaningful Conversations Done", report.today.positive, report.mtd.positive],
    ["Site Visits Scheduled", report.today.scheduled, report.mtd.scheduled],
    ["Site Visit Done", report.today.done, report.mtd.done],
    ...(sole ? [["Walk In Done", report.today.walkIn, report.mtd.walkIn] as [string, number, number]] : []),
    ["Bookings", report.today.tokens, report.mtd.tokens],
    ["Site Visit Conversion %", report.today.siteVisitConversion, report.mtd.siteVisitConversion],
    ["Closure Conversion%", report.today.closureConversion, report.mtd.closureConversion],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Daily Report">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-[400px] overflow-y-auto rounded-t-card bg-white shadow-lg sm:rounded-card">
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-white px-5 py-3.5">
          <div>
            <h3 className="text-base font-semibold text-ink">Daily Report</h3>
            <p className="text-xs text-ink-faint">{report.title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div ref={captureRef} className="space-y-4 bg-white px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-ink">Name: {report.employeeName}</p>
            {sole && report.projectName && <p className="text-sm text-ink-muted">Project: {report.projectName}</p>}
          </div>
          <table className="w-full overflow-hidden rounded-xl border border-surface-border text-sm">
            <thead>
              <tr className="bg-ink text-left text-xs text-white">
                <th className="px-3 py-2 font-medium">Particulars</th>
                <th className="px-2 py-2 text-center font-medium">{shortDate(report.date)}</th>
                <th className="px-2 py-2 text-center font-medium">MTD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, t, m]) => (
                <tr key={label} className="border-t border-surface-border">
                  <td className="px-3 py-2 text-ink-muted">{label}</td>
                  <td className="px-2 py-2 text-center font-semibold text-ink">{t}</td>
                  <td className="px-2 py-2 text-center font-semibold text-ink">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Section title="Today's Visit Done" items={report.doneVisits.map((v) => `${v.client} – ${time12(v.time)}`)} />
          {sole && <Section title="Today's Walk In Done" items={report.walkIns} />}
          <Section
            title="Site Visit Scheduled Details"
            items={report.scheduledDetails.map((v) => `${v.client} – ${shortDate(v.date)}${v.status === "Pending" && !v.rescheduleDate ? "" : ` · ${visitStatusLabel(v)}`}`)}
          />

          {report.source === "import" && (
            <p className="rounded-xl bg-surface px-3 py-2 text-xs text-ink-faint">Imported from the old Google Sheet.</p>
          )}
          {report.updatedAt && (
            <p className="text-xs text-ink-faint">Last edited {formatDateTime(report.updatedAt)}{report.updatedByName ? ` by ${report.updatedByName}` : ""}</p>
          )}
        </div>

        <div className="sticky bottom-0 space-y-2 border-t border-surface-border bg-white px-5 py-3">
          <div className="flex gap-2">
            <a href={whatsappUrl(report)} target="_blank" rel="noopener noreferrer"
               className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1fa855] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a9049]">
              <WhatsAppIcon /> Share on WhatsApp
            </a>
            <SecondaryButton onClick={() => downloadImage(captureRef.current, report, setSaving)} disabled={saving} className="justify-center px-3.5" aria-label="Download image">
              <Download className="h-4 w-4" /> {saving ? "Saving…" : <><span className="sm:hidden">Download</span><span className="hidden sm:inline">Download image</span></>}
            </SecondaryButton>
          </div>
          {(editHref || showHistory) && (
            <div className="flex gap-2">
              {editHref && (
                <Link href={editHref} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              )}
              {showHistory && (
                <SecondaryButton className="flex-1 justify-center" onClick={() => setHistoryOpen(true)}>
                  <History className="h-3.5 w-3.5" /> History{report.changeCount ? ` (${report.changeCount})` : ""}
                </SecondaryButton>
              )}
            </div>
          )}
        </div>
      </div>
      {historyOpen && <HistoryPanel reportId={report.id} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

/** Saves the popup's report area (table + lists) as a PNG. */
async function downloadImage(node: HTMLElement | null, report: SalesReportDetail, setSaving: (v: boolean) => void) {
  if (!node) return;
  setSaving(true);
  try {
    const { toPng } = await import("html-to-image");
    const url = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title.replace(/[^\w]+/g, "-")}-${report.employeeName.replace(/\s+/g, "-")}-${report.date}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setSaving(false);
  }
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="text-sm">
      <p className="font-semibold text-ink">{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
      ) : <p className="mt-1 text-ink-faint">-</p>}
    </div>
  );
}

function HistoryPanel({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const { data, loading, error } = useApi(() => api.reportHistory(reportId), [reportId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Change history">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-white shadow-lg sm:rounded-card">
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-white px-5 py-3.5">
          <h3 className="text-sm font-semibold text-ink">Change history</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          {loading && !data && <Loading />}
          {error && <p className="text-sm text-status-danger">{error}</p>}
          {data && data.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">No changes recorded for this report.</p>}
          <ol className="space-y-3">
            {(data ?? []).map((c, i) => (
              <li key={i} className="border-l-2 border-brand pl-3 text-sm">
                <p className="text-xs text-ink-faint">{formatDateTime(c.at)} · {c.by ?? "—"}</p>
                <p className="font-medium text-ink">{c.field}</p>
                {c.field !== "Report" ? (
                  <p className="text-ink-muted"><span className="line-through decoration-ink-faint">{c.old ?? "—"}</span> → <span className="text-ink">{c.new ?? "—"}</span></p>
                ) : <p className="text-ink-muted">{c.new}</p>}
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-surface-border px-5 py-3"><PrimaryButton className="w-full justify-center" onClick={onClose}>Close</PrimaryButton></div>
      </div>
    </div>
  );
}

/** Loads a report by id and shows the popup. */
export function ReportSummaryById({
  reportId, onClose, isManager,
}: { reportId: string; onClose: () => void; isManager: boolean }) {
  const { data, error } = useApi(() => api.getReport(reportId), [reportId]);
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
        <div className="relative z-10 rounded-card bg-white p-5 text-sm text-status-danger shadow-lg">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink/40" />
        <div className="relative z-10 rounded-card bg-white px-8 shadow-lg"><Loading /></div>
      </div>
    );
  }
  return (
    <ReportSummary
      report={data}
      onClose={onClose}
      showHistory={isManager}
      editHref={data.canEdit ? `/reports/edit/${data.id}` : null}
    />
  );
}
