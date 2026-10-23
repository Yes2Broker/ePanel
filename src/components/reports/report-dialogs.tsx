"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { REPORT_FIELDS, reportStatusLabel } from "@/lib/constants";
import { DailyReport, ReportType } from "@/types";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils";

export interface ReportDraft {
  id: string | null;
  type: ReportType;
  date: string;
  data: DailyReport["data"];
}

export function ReportFormDialog({
  draft, onClose, onSave, saving,
}: { draft: ReportDraft | null; onClose: () => void; onSave: (draft: ReportDraft, submit: boolean) => void; saving: boolean }) {
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (draft) {
      setDate(draft.date);
      setValues(Object.fromEntries(Object.entries(draft.data).map(([k, v]) => [k, String(v)])));
    }
  }, [draft]);

  if (!draft) return null;
  const fields = REPORT_FIELDS[draft.type];

  const collect = (): DailyReport["data"] =>
    Object.fromEntries(
      fields
        .filter((f) => (values[f.key] ?? "").trim() !== "")
        .map((f) => [f.key, f.kind === "number" ? Number(values[f.key]) : values[f.key].trim()])
    );

  return (
    <Modal open onClose={onClose} title={`${draft.id ? "Edit" : "New"} ${draft.type} Report`} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...draft, date, data: collect() }, true);
        }}
        className="space-y-4"
      >
        <Field label="Report date">
          <input type="date" required disabled={!!draft.id} max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {fields.filter((f) => f.kind === "number").map((f) => (
            <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
              <input
                type="number" min={0} inputMode="numeric" required={f.required}
                value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
        {fields.filter((f) => f.kind !== "number").map((f) => (
          <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
            {f.kind === "textarea" ? (
              <textarea rows={3} required={f.required} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
            ) : (
              <input required={f.required} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls} />
            )}
          </Field>
        ))}
        <p className="text-xs text-ink-faint">Once submitted, a report can&apos;t be edited unless it&apos;s sent back to you.</p>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <SecondaryButton type="button" disabled={saving} onClick={() => onSave({ ...draft, date, data: collect() }, false)}>Save draft</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Submit report"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export function ReportViewDialog({
  report, onClose, onReview, saving,
}: { report: DailyReport | null; onClose: () => void; onReview?: (approve: boolean, note: string) => void; saving?: boolean }) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [report]);
  if (!report) return null;

  const fields = REPORT_FIELDS[report.type];
  const known = new Set(fields.map((f) => f.key));
  // Answers to fields that have since been removed from the form are still shown.
  const extra = Object.keys(report.data).filter((k) => !known.has(k));

  return (
    <Modal open onClose={onClose} title={`${report.type} Report — ${formatDate(report.date)}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">{report.employeeName}</span>
          <StatusPill status={reportStatusLabel(report.status)} />
          {report.submittedAt && <span className="text-xs text-ink-faint">Submitted {formatDateTime(report.submittedAt)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {fields.filter((f) => f.kind === "number").map((f) => (
            <div key={f.key}>
              <p className="text-xs text-ink-faint">{f.label}</p>
              <p className="mt-0.5 text-lg font-semibold text-ink">{report.data[f.key] ?? "—"}</p>
            </div>
          ))}
        </div>
        {[...fields.filter((f) => f.kind !== "number").map((f) => [f.key, f.label]), ...extra.map((k) => [k, k])].map(([key, label]) => (
          <div key={key} className="text-sm">
            <p className="text-xs text-ink-faint">{label}</p>
            <p className="mt-0.5 whitespace-pre-line text-ink">{report.data[key] || "—"}</p>
          </div>
        ))}
        {report.reviewNote && (
          <div className="rounded-xl bg-surface px-3.5 py-2.5 text-sm">
            <p className="text-xs text-ink-faint">Feedback from {report.reviewedBy}</p>
            <p className="mt-0.5 text-ink">{report.reviewNote}</p>
          </div>
        )}
        {onReview && report.status === "Submitted" && (
          <div className="space-y-3 border-t border-surface-border pt-4">
            <Field label="Feedback (required to send back)">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please add the site visit details" className={inputCls} />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton type="button" disabled={saving || !note.trim()} onClick={() => onReview(false, note)}>Send back</SecondaryButton>
              <PrimaryButton type="button" disabled={saving} onClick={() => onReview(true, note)}>{saving ? "Saving…" : "Approve"}</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
