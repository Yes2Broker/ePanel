"use client";

import { useRef, useState } from "react";
import { Download, FileUp, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { ErrorBanner, Loading, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { MonthField, Select } from "@/components/ui/pickers";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { attUpdatesChanged } from "@/lib/att-updates";
import type { AttendanceKind, AttendanceRow } from "@/lib/attendance-parse";
import { AttImportResult } from "@/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const KIND_LABEL: Record<AttendanceKind, string> = {
  etimeoffice: "eTimeOffice Month IN/OUT report",
  template: "Upload template",
  history: "Old attendance history",
};

interface Loaded { file: string; kind: AttendanceKind; rows: AttendanceRow[] }

/**
 * Upload page (HR/Admin): pick a file → preview per person (nothing saved) → Import.
 * Machine codes match automatically (0002 → EMP002); codes that don't are mapped
 * once here and remembered. Re-uploading never duplicates a day and never
 * overwrites a day HR edited.
 */
export function AttendanceUpload({ onImported }: { onImported?: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const isAdmin = user?.role === "Admin";
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AttImportResult | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "importing">("");
  const [error, setError] = useState("");
  const employees = useApi(() => api.listEmployees());
  const uploads = useApi(() => api.attUploads());
  type Upload = NonNullable<typeof uploads.data>[number];
  const [deleting, setDeleting] = useState<Upload | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const range = (u: Upload) => `${formatDate(u.from)} – ${formatDate(u.to)}`;
  const doDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const r = await api.attDeleteUpload(deleting.id);
      toast(`Upload deleted: ${r.removed} day${r.removed === 1 ? "" : "s"} removed, ${r.restored} restored${r.kept ? `, ${r.kept} kept (edited since)` : ""}.`);
      setDeleting(null);
      uploads.reload();
      onImported?.();
      attUpdatesChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDeletingBusy(false);
    }
  };

  // Pre-filled template for a month: every active employee × every day (attendance-template.ts).
  const [tplMonth, setTplMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tplBusy, setTplBusy] = useState(false);
  const downloadTemplate = async () => {
    setTplBusy(true);
    try {
      const [{ buildAttendanceTemplate }, employees] = await Promise.all([import("@/lib/attendance-template"), api.listEmployees()]);
      const t = await buildAttendanceTemplate(employees, tplMonth);
      const url = URL.createObjectURL(new Blob([t.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url; a.download = t.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setTplBusy(false);
    }
  };

  const check = async (l: Loaded, m: Record<string, string>) => {
    setBusy("checking");
    setError("");
    try {
      setPreview(await api.attImport(l.kind, l.rows, m, l.file, true));
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy("reading");
    setError("");
    setPreview(null);
    setMap({});
    try {
      const { parseAttendanceFile } = await import("@/lib/attendance-parse");
      const p = await parseAttendanceFile(file);
      if (!p.rows.length) throw new Error("No attendance rows found in this file.");
      if (p.kind === "history" && !isAdmin) throw new Error("Only an Admin can import the old attendance history.");
      const l = { file: file.name, kind: p.kind, rows: p.rows };
      setLoaded(l);
      await check(l, {});
    } catch (err) {
      setLoaded(null);
      setError(errorMessage(err));
      setBusy("");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const doImport = async () => {
    if (!loaded) return;
    setBusy("importing");
    try {
      const r = await api.attImport(loaded.kind, loaded.rows, map, loaded.file, false);
      toast(`Imported: ${r.added} added, ${r.updated} updated, ${r.kept} kept (edited by HR), ${r.unchanged} unchanged.`);
      setLoaded(null);
      setPreview(null);
      setMap({});
      uploads.reload();
      onImported?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const undecided = preview?.unmatched.filter((u) => !map[u.code]) ?? [];
  const skipped = preview?.unmatched.filter((u) => map[u.code] === "-") ?? [];
  const downloadComparison = () => {
    if (!preview) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Date", "Code", "Name", "In", "Out", "Sheet Late", "Sheet Half Day", "Panel Late", "Panel Half Day"].join(","),
      ...preview.comparison.map((c) => [c.date, c.employee.id, c.employee.name, c.in, c.out, c.sheetLate, c.sheetHalf, c.late, c.half].map(esc).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "attendance-recalculation-differences.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => input.current?.click()} disabled={!!busy}>
            <FileUp className="h-4 w-4" /> {busy === "reading" ? "Reading…" : "Choose file"}
          </PrimaryButton>
          <span className="inline-flex items-center gap-2">
            <MonthField ariaLabel="Template month" value={tplMonth} onChange={setTplMonth} />
            <SecondaryButton onClick={downloadTemplate} disabled={tplBusy}>
              <Download className="h-4 w-4" /> {tplBusy ? "Preparing…" : "Download template"}
            </SecondaryButton>
          </span>
        </div>
        <input ref={input} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
          <li><b className="font-medium">eTimeOffice</b>: the &quot;Month IN/OUT Report&quot; .xls exactly as downloaded.</li>
          <li><b className="font-medium">Template</b>: pre-filled with every active employee and day of the month; type only In Time / Out Time (and Paid Leave). The old 6-column template still works.</li>
          {isAdmin && <li><b className="font-medium">History</b> (Admin, one time): the old Google Sheet &quot;Attendance&quot; tab as CSV, or a monthly workbook with one sheet per person.</li>}
          <li>Upload the month once and extra files any time. Days already in the panel are updated, never duplicated; days edited by HR are kept.</li>
        </ul>
      </Card>

      <ErrorBanner message={error} />
      {busy === "checking" && !preview && <Loading rows={3} />}

      {loaded && preview && (
        <div className="space-y-3">
          <Card className="p-4">
            <p className="break-words text-sm font-semibold text-ink">{loaded.file}</p>
            <p className="text-xs text-ink-muted">
              {KIND_LABEL[loaded.kind]} · {preview.rows} rows · {formatDate(preview.from)} – {formatDate(preview.to)}
              {preview.future ? ` · ${preview.future} future days skipped` : ""}
            </p>
            <p className="mt-1 text-xs text-ink-faint">Preview only — nothing is saved until you press Import.</p>
          </Card>

          {preview.unmatched.length > 0 && (
            <Card className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><TriangleAlert className="h-4 w-4 text-status-warning" /> Codes not matched</p>
              <p className="text-xs text-ink-muted">Choose who each code is. The panel remembers it for next time.</p>
              {preview.unmatched.map((u) => (
                <div key={u.code} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm text-ink">{u.code}{u.name ? ` · ${u.name}` : ""} <span className="text-ink-faint">({u.rows} rows)</span></span>
                  <Select value={map[u.code] ?? ""} ariaLabel={`Employee for ${u.code}`} placeholder="Choose…"
                    onChange={(v) => setMap((m) => { const next = { ...m }; if (v) next[u.code] = v; else delete next[u.code]; return next; })}
                    options={[{ value: "", label: "Choose…" }, { value: "-", label: "Skip these rows" }, ...(employees.data ?? []).map((e) => ({ value: e.id, label: `${e.name} (${e.id})` }))]} />
                </div>
              ))}
              <SecondaryButton onClick={() => check(loaded, map)} disabled={!!busy}>{busy === "checking" ? "Checking…" : "Check again"}</SecondaryButton>
            </Card>
          )}

          {preview.errorCount > 0 && (
            <Card className="space-y-1 p-4">
              <p className="text-sm font-semibold text-status-danger">{preview.errorCount} row{preview.errorCount === 1 ? "" : "s"} can&apos;t be read (skipped)</p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-ink-muted">
                {preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
              </ul>
            </Card>
          )}

          {/* Phones: one card per person. */}
          <div className="space-y-2 md:hidden">
            {preview.people.map((p) => (
              <Card key={p.employee.id} className="p-3.5">
                <p className="break-words text-sm font-medium text-ink">{p.employee.name} <span className="font-normal text-ink-faint">· {p.employee.id}</span></p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {p.days} days · P {p.present} · A {p.absent} · W {p.weekoff}{p.paidLeave ? ` · PL ${p.paidLeave}` : ""} · Late {p.late} · Short {p.short}
                  {p.kept > 0 && ` · ${p.kept} kept`}
                </p>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  {["Person", "Days", "Present", "Absent", "Weekoff", "Paid leave", "Late", "Short", "Kept"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap px-3 py-2.5 font-medium", i ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {preview.people.map((p) => (
                  <tr key={p.employee.id}>
                    <td className="px-3 py-2"><span className="whitespace-nowrap">{p.employee.name}</span> <span className="text-xs text-ink-faint">{p.employee.id}</span></td>
                    {[p.days, p.present, p.absent, p.weekoff, p.paidLeave, p.late, p.short].map((v, i) => <td key={i} className="px-3 py-2 text-right">{v}</td>)}
                    <td className="px-3 py-2 text-right text-ink-muted" title="Days edited by HR are kept">{p.kept || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {preview.people.some((p) => p.kept > 0) && <p className="text-xs text-ink-faint">&quot;Kept&quot; = days edited by HR (or imported from the old history); the file won&apos;t change them.</p>}

          {loaded.kind === "history" && (
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Late / Half Day worked out again: {preview.comparison.length} differ from the sheet</p>
                {preview.comparison.length > 0 && <SecondaryButton onClick={downloadComparison}><Download className="h-4 w-4" /> CSV</SecondaryButton>}
              </div>
              <p className="text-xs text-ink-muted">Status is kept as in the sheet. Late, Late Half and Short Day follow the panel rules (a late day that is also short counts once, as Short).</p>
              {preview.comparison.length > 0 && (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead><tr className={tableHeadCls}>{["Date", "Person", "In–Out", "Sheet Late / Half", "Panel"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-surface-border">
                      {preview.comparison.map((c, i) => (
                        <tr key={i}>
                          <td className="whitespace-nowrap px-2 py-1.5">{formatDate(c.date)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{c.employee.name}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{c.in ?? "—"}–{c.out ?? "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{c.sheetLate || "—"} / {c.sheetHalf || "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{c.late} / {c.half}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={doImport} disabled={!!busy || !preview.people.length || undecided.length > 0}>
              {busy === "importing" ? "Importing…" : `Import ${preview.people.reduce((t, p) => t + p.days - p.kept, 0)} days`}
            </PrimaryButton>
            <SecondaryButton onClick={() => { setLoaded(null); setPreview(null); setMap({}); }} disabled={!!busy}>Cancel</SecondaryButton>
            {undecided.length > 0 && <span className="text-xs text-status-warning">Choose an employee (or Skip) for every unmatched code, then Check again.</span>}
            {!undecided.length && skipped.length > 0 && <span className="text-xs text-ink-faint">{skipped.reduce((t, u) => t + u.rows, 0)} rows with skipped codes won&apos;t be imported.</span>}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Recent uploads</h2>
        <ErrorBanner message={uploads.error} onRetry={uploads.reload} />
        {uploads.loading && !uploads.data ? <Loading rows={2} /> : !(uploads.data ?? []).length ? (
          <p className="text-sm text-ink-faint">Nothing uploaded yet.</p>
        ) : (
          <Card className="divide-y divide-surface-border">
            {(uploads.data ?? []).map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-3.5 py-2.5 sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className={cn("break-words text-sm", u.deletedAt ? "text-ink-faint line-through" : "text-ink")}>{u.file}</p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(u.at)} · {u.by ?? "—"} · {range(u)} · {u.added} added · {u.updated} updated{u.kept ? ` · ${u.kept} kept – edited by HR` : ""}
                  </p>
                  {u.deletedAt && <p className="text-xs text-status-danger">Deleted by {u.deletedBy ?? "—"} on {formatDateTime(u.deletedAt)}</p>}
                </div>
                {!u.deletedAt && (u.kind !== "history" || isAdmin) && (
                  <button onClick={() => setDeleting(u)} title="Delete upload" aria-label={`Delete upload ${u.file}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-surface hover:text-status-danger sm:h-9 sm:w-9">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete this upload?" size="sm"
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton className="justify-center" onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
          <PrimaryButton className="justify-center bg-status-danger hover:bg-status-danger/90" disabled={deletingBusy} onClick={doDelete}>{deletingBusy ? "Deleting…" : "Delete"}</PrimaryButton>
        </div>}>
        {deleting && (
          <p className="text-sm text-ink-muted">
            Delete upload <b className="break-words font-medium text-ink">{deleting.file}</b> ({range(deleting)})? Days added by this upload are removed
            and days it changed go back to how they were. HR edits made after the upload are kept.
          </p>
        )}
      </Modal>
    </div>
  );
}
