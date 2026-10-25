"use client";

import { useRef, useState } from "react";
import { Download, FileUp, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { ErrorBanner, Loading, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
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
          <a href="/templates/Y2B_Attendance_Upload_Template.xlsx" download
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-surface-border bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-surface">
            <Download className="h-4 w-4" /> Download template
          </a>
        </div>
        <input ref={input} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
          <li><b className="font-medium">eTimeOffice</b>: the &quot;Month IN/OUT Report&quot; .xls exactly as downloaded.</li>
          <li><b className="font-medium">Template</b>: Date (DD/MM/YYYY) · Employee Code · In Time · Out Time · Paid Leave (Yes/blank) · Remark.</li>
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
                  <select value={map[u.code] ?? ""} aria-label={`Employee for ${u.code}`} className={selectCls}
                    onChange={(e) => setMap((m) => { const next = { ...m }; if (e.target.value) next[u.code] = e.target.value; else delete next[u.code]; return next; })}>
                    <option value="">Choose…</option>
                    <option value="-">Skip these rows</option>
                    {(employees.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                  </select>
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
                  {p.missed > 0 && <span className="font-medium text-status-danger"> · {p.missed} missed punch</span>}
                  {p.kept > 0 && ` · ${p.kept} kept`}
                </p>
              </Card>
            ))}
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  {["Person", "Days", "Present", "Absent", "Weekoff", "Paid leave", "Late", "Short", "Missed punch", "Kept"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap px-3 py-2.5 font-medium", i ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {preview.people.map((p) => (
                  <tr key={p.employee.id}>
                    <td className="px-3 py-2"><span className="whitespace-nowrap">{p.employee.name}</span> <span className="text-xs text-ink-faint">{p.employee.id}</span></td>
                    {[p.days, p.present, p.absent, p.weekoff, p.paidLeave, p.late, p.short].map((v, i) => <td key={i} className="px-3 py-2 text-right">{v}</td>)}
                    <td className={cn("px-3 py-2 text-right", p.missed > 0 && "font-medium text-status-danger")}>{p.missed}</td>
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
              <div key={u.id} className="px-3.5 py-2.5 sm:px-4">
                <p className="break-words text-sm text-ink">{u.file}</p>
                <p className="text-xs text-ink-muted">
                  {formatDateTime(u.at)} · {u.by ?? "—"} · {formatDate(u.from)} – {formatDate(u.to)} · {u.added} added · {u.updated} updated{u.kept ? ` · ${u.kept} kept – edited by HR` : ""}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
