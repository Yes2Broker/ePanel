"use client";

import { FiledLate } from "@/components/reports/filed-late";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, History, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { HotTable, hotText } from "@/components/reports/hot-clients";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Loading, Skeleton } from "@/components/ui/page";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { SalesReportDetail } from "@/types";
import { shortDate, time12, visitStatusLabel } from "@/lib/report-format";
import { formatDateTime, initials } from "@/lib/utils";
import { photosLoaded, usePhotos } from "@/lib/avatars";

/** Today vs MTD popup — the same table and lists as the old forms. */
export function ReportSummary({
  report, onClose, showHistory, editHref,
}: { report: SalesReportDetail; onClose: () => void; showHistory?: boolean; editHref?: string | null }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const sole = report.type === "Sole Selling";
  const toast = useToast();
  const hot = useApi(() => api.hotForReport(report.id).catch(() => null), [report.id, report.updatedAt]);
  const photo = useInlinePhoto(report.employeeId);
  // The image waits for the hot clients and the photo (part of the picture).
  const image = useReportImage(captureRef, report, hot.loading || !photo.ready ? undefined : `${JSON.stringify(hot.data ?? "none")}|${photo.src ?? ""}`);
  const hotBlock = hotText(hot.data, report.date);
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

  // Plain text for WhatsApp: the same table, lists and hot clients block (no phone numbers).
  const copy = async () => {
    const list = (title: string, items: string[]) => [`*${title}*`, ...(items.length ? items.map((t) => `• ${t}`) : ["-"])].join("\n");
    const text = [
      `*Daily Report – ${report.title}*`, `Name: ${report.employeeName}`, `Date: ${shortDate(report.date)}`,
      ...(sole && report.projectName ? [`Project: ${report.projectName}`] : []), "",
      ...rows.map(([label, t, m]) => `${label}: ${t} (MTD ${m})`), "",
      list("Today's Visit Done", report.doneVisits.map((v) => `${v.client} – ${time12(v.time)}`)),
      ...(sole ? ["", list("Today's Walk In Done", report.walkIns)] : []), "",
      list("Site Visit Scheduled Details", report.scheduledDetails.map((v) => `${v.client} – ${shortDate(v.date)}${v.status === "Pending" && !v.rescheduleDate ? "" : ` · ${visitStatusLabel(v)}`}`)),
      ...(hotBlock ? ["", hotBlock] : []),
    ].join("\n");
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it in WhatsApp."); } catch { toast("Couldn't copy on this device.", "error"); }
  };

  const footer = (
    <div className="space-y-2">
      <div className="flex gap-2">
        <SecondaryButton onClick={image.save} disabled={image.busy || hot.loading || !photo.ready} className="flex-1 justify-center py-2.5">
          <Download className="h-4 w-4" />
          {image.busy ? "Saving…" : <><span className="sm:hidden">Save image</span><span className="hidden sm:inline">Download image</span></>}
        </SecondaryButton>
        <SecondaryButton onClick={copy} className="flex-1 justify-center py-2.5"><Copy className="h-4 w-4" /> Copy text</SecondaryButton>
      </div>
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
      <Modal open onClose={onClose} title="Daily Report" subtitle={report.title} size="md" footer={footer} bodyClassName="p-0">
        <div ref={captureRef} className="space-y-4 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            {/* The report's person (not the viewer): own photo, else default, else initials. Inlined so the image always has it. */}
            {photo.src
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo.src} alt={report.employeeName} data-report-photo className="h-14 w-14 shrink-0 rounded-full object-cover" />
              : <span data-report-photo className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-base font-medium text-white">{initials(report.employeeName)}</span>}
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">Name: <b className="text-base font-semibold text-ink">{report.employeeName}</b><FiledLate r={report} /></p>
              {sole && report.projectName && <p className="text-sm text-ink-muted">Project: {report.projectName}</p>}
            </div>
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

          <HotTable block={hot.data} reportDate={report.date} />

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

/**
 * A person's photo as a data URL (fetched once), so the saved image always
 * includes it (no cross-site image for the canvas). null = no photo: initials.
 */
function useInlinePhoto(employeeId: string) {
  const photos = usePhotos();
  const url = photos[employeeId]?.url ?? null;
  const [state, setState] = useState<{ src: string | null; ready: boolean }>({ src: null, ready: false });
  useEffect(() => {
    let live = true;
    if (!url) {
      // Not loaded yet vs. really no photo: wait for the photo list, then show initials.
      setState({ src: null, ready: photosLoaded() });
      return;
    }
    setState((s) => ({ ...s, ready: false }));
    fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); }))
      .then((src) => new Promise<string>((res) => { const i = new Image(); i.onload = () => res(src); i.onerror = () => res(src); i.src = src; }))
      .then((src) => { if (live) setState({ src, ready: true }); })
      .catch(() => { if (live) setState({ src: null, ready: true }); });
    return () => { live = false; };
  }, [url, photos]);
  return state;
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * The popup's report area (table + lists) as a PNG. Phones get the share sheet
 * (save to Photos, send anywhere); everything else downloads the file.
 * The image is drawn as soon as the popup opens: iPhones only allow the share
 * sheet straight after a tap, so there's no time to draw it then.
 */
function useReportImage(ref: React.RefObject<HTMLElement>, report: SalesReportDetail, extra?: unknown) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<Promise<File | null> | null>(null);
  const name = `${report.title.replace(/[^\w]+/g, "-")}-${report.employeeName.replace(/\s+/g, "-")}-${report.date}.png`;

  const render = () => {
    if (!fileRef.current) {
      fileRef.current = (async () => {
        if (!ref.current) return null;
        const { toBlob } = await import("html-to-image");
        // Wait for the web fonts, so text is drawn with the real font and nothing shifts.
        await document.fonts?.ready;
        const blob = await toBlob(ref.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
        return blob ? new File([blob], name, { type: "image/png" }) : null;
      })().catch(() => null);
    }
    return fileRef.current;
  };

  useEffect(() => {
    fileRef.current = null;
    // Phones make the image ahead (the share sheet needs it at once), once everything has loaded.
    if (isPhone() && extra !== undefined) {
      const t = window.setTimeout(render, 300);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, extra]);

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

export function HistoryPanel({ reportId, onClose }: { reportId: string; onClose: () => void }) {
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
  reportId, onClose,
}: { reportId: string; onClose: () => void }) {
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
      showHistory
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
