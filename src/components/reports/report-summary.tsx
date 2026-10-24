"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, History, Pencil } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Loading, Skeleton } from "@/components/ui/page";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { SalesReportDetail } from "@/types";
import { shortDate, time12, visitStatusLabel } from "@/lib/report-format";
import { formatDateTime } from "@/lib/utils";

/** Today vs MTD popup — the same table and lists as the old forms. */
export function ReportSummary({
  report, onClose, showHistory, editHref,
}: { report: SalesReportDetail; onClose: () => void; showHistory?: boolean; editHref?: string | null }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const image = useReportImage(captureRef, report);
  const sole = report.type === "Sole Selling";
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

  const footer = (
    <div className="space-y-2">
      <SecondaryButton onClick={image.save} disabled={image.busy} className="w-full justify-center py-2.5">
        <Download className="h-4 w-4" />
        {image.busy ? "Saving…" : <><span className="sm:hidden">Save image</span><span className="hidden sm:inline">Download image</span></>}
      </SecondaryButton>
      {(editHref || showHistory) && (
        <div className="flex gap-2">
          {editHref && (
            <Link href={editHref} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface">
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
  );

  return (
    <>
      <Modal open onClose={onClose} title="Daily Report" subtitle={report.title} size="sm" footer={footer} bodyClassName="p-0">
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

      </Modal>
      {historyOpen && <HistoryPanel reportId={report.id} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * The popup's report area (table + lists) as a PNG. Phones get the share sheet
 * (save to Photos, send anywhere); everything else downloads the file.
 * The image is drawn as soon as the popup opens: iPhones only allow the share
 * sheet straight after a tap, so there's no time to draw it then.
 */
function useReportImage(ref: React.RefObject<HTMLElement>, report: SalesReportDetail) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<Promise<File | null> | null>(null);
  const name = `${report.title.replace(/[^\w]+/g, "-")}-${report.employeeName.replace(/\s+/g, "-")}-${report.date}.png`;

  const render = () => {
    if (!fileRef.current) {
      fileRef.current = (async () => {
        if (!ref.current) return null;
        const { toBlob } = await import("html-to-image");
        const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
        return blob ? new File([blob], name, { type: "image/png" }) : null;
      })().catch(() => null);
    }
    return fileRef.current;
  };

  useEffect(() => {
    fileRef.current = null;
    if (isPhone()) {
      const t = window.setTimeout(render, 300);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const save = async () => {
    setBusy(true);
    try {
      const file = await render();
      if (!file) return;
      if (isPhone() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: report.title });
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return; // they closed the share sheet
          // not allowed here: download it instead
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  };

  return { save, busy };
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
  return (
    <Modal open onClose={onClose} title="Change history" size="lg"
      footer={<PrimaryButton className="w-full justify-center" onClick={onClose}>Close</PrimaryButton>}>
      {loading && !data && <Loading />}
      {error && <p className="text-sm text-status-danger">{error}</p>}
      {data && data.length === 0 && <p className="py-6 text-center text-sm text-ink-faint">No changes recorded for this report.</p>}
      <ol className="space-y-3">
        {(data ?? []).map((c, i) => (
          <li key={i} className="break-words border-l-2 border-brand pl-3 text-sm">
            <p className="text-xs text-ink-faint">{formatDateTime(c.at)} · {c.by ?? "—"}</p>
            <p className="font-medium text-ink">{c.field}</p>
            {c.field !== "Report" ? (
              <p className="text-ink-muted"><span className="line-through decoration-ink-faint">{c.old ?? "—"}</span> → <span className="text-ink">{c.new ?? "—"}</span></p>
            ) : <p className="text-ink-muted">{c.new}</p>}
          </li>
        ))}
      </ol>
    </Modal>
  );
}

/** Loads a report by id and shows the popup. */
export function ReportSummaryById({
  reportId, onClose, isManager,
}: { reportId: string; onClose: () => void; isManager: boolean }) {
  const { data, error } = useApi(() => api.getReport(reportId), [reportId]);
  if (error || !data) {
    return (
      <Modal open onClose={onClose} title="Daily Report" size="sm">
        {error ? <p className="text-sm text-status-danger">{error}</p> : <ReportSkeleton />}
      </Modal>
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

function ReportSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading report">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}
