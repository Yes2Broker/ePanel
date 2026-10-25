"use client";

import { useEffect, useMemo, useState } from "react";
import { Paperclip, X, CalendarClock, UserRoundCheck } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { LeavePreview } from "@/types";
import { addDays, cn, formatDate, todayISO } from "@/lib/utils";
import { daysLabel } from "@/components/leave/leave-card";

const MAX_BYTES = 5 * 1024 * 1024;
const CHUNK = 1024 * 1024; // bytes per upload call
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

type VisitChoice = { action: "reschedule" | "handover" | ""; date: string; to: string };

/** Big phone photos are shrunk before upload (most medical notes are photos). */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

async function upload(file: File) {
  const id = crypto.randomUUID();
  const buf = new Uint8Array(await file.arrayBuffer());
  for (let seq = 0, off = 0; off < buf.length; seq++, off += CHUNK) {
    const part = buf.subarray(off, off + CHUNK);
    let bin = "";
    for (let i = 0; i < part.length; i += 0x8000) bin += String.fromCharCode(...part.subarray(i, i + 0x8000));
    await api.leaveUploadChunk(id, seq, btoa(bin));
  }
  return id;
}

export function ApplyLeave({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [half, setHalf] = useState<"" | "first" | "second">("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LeavePreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [choices, setChoices] = useState<Record<string, VisitChoice>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(today); setEnd(today); setHalf(""); setReason(""); setFile(null); setChoices({});
  }, [open, today]);

  const single = !!half;
  const effEnd = single ? start : end;

  useEffect(() => {
    if (!open || !start || !effEnd) { setPreview(null); setPreviewError(""); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.leavePreview({ start, end: effEnd, half: half || null })
        .then((p) => { if (live) { setPreview(p); setPreviewError(""); } })
        .catch((e) => { if (live) { setPreview(null); setPreviewError(errorMessage(e)); } });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [open, start, effEnd, half]);

  const leaveDays = useMemo(() => new Set((preview?.days ?? []).map((d) => d.date)), [preview]);
  const visitsOk = (preview?.visits ?? []).every((v) => {
    const c = choices[v.id];
    return c && ((c.action === "reschedule" && c.date && c.date >= today && !leaveDays.has(c.date)) || (c.action === "handover" && c.to));
  });
  const ready = !!preview && !previewError && reason.trim() && visitsOk;

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type) && !/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(f.name)) { toast("Attach a photo or a PDF.", "error"); return; }
    if (f.size > MAX_BYTES && !/^image\//.test(f.type)) { toast("The file is larger than 5 MB.", "error"); return; }
    setFile(f);
  };

  const send = async () => {
    setSending(true);
    try {
      let uploadId: string | null = null;
      let sent: File | null = null;
      if (file) {
        sent = await shrinkImage(file);
        if (sent.size > MAX_BYTES) throw new Error("The file is larger than 5 MB.");
        uploadId = await upload(sent);
      }
      const app = await api.leaveApply({
        start, end: effEnd, half: half || null, reason: reason.trim(),
        uploadId, fileName: sent?.name ?? null, mime: sent ? (sent.type || (sent.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg")) : null,
        visits: (preview?.visits ?? []).map((v) => ({ visitId: v.id, action: choices[v.id].action, date: choices[v.id].date || null, to: choices[v.id].to || null })),
      });
      toast(app.status === "Approved" ? "Leave added (approved)." : "Leave request sent for approval.");
      onDone();
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(false);
    }
  };

  const setChoice = (id: string, patch: Partial<VisitChoice>) =>
    setChoices((c) => ({ ...c, [id]: { ...(c[id] ?? { action: "", date: "", to: "" }), ...patch } }));

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" size="md"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton className="justify-center" onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton className="justify-center" disabled={!ready || sending} onClick={send}>{sending ? "Sending…" : "Send request"}</PrimaryButton>
      </div>}>
      <div className="space-y-4">
        {/* Dates */}
        <div className={cn("grid gap-3", !single && "grid-cols-2")}>
          <Field label={single ? "Date" : "From"}>
            <input type="date" value={start} min={addDays(today, -7)}
              onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} className={cn(inputCls, "min-w-0 px-2.5")} />
          </Field>
          {!single && (
            <Field label="To">
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={cn(inputCls, "min-w-0 px-2.5")} />
            </Field>
          )}
        </div>
        {start === end && (
          <Field label="Full or half day">
            <select value={half} onChange={(e) => setHalf(e.target.value as typeof half)} className={inputCls}>
              <option value="">Full day</option>
              <option value="first">First half (0.5 day)</option>
              <option value="second">Second half (0.5 day)</option>
            </select>
          </Field>
        )}
        {start !== end && <p className="-mt-2 text-xs text-ink-faint">Half days: choose the same From and To date.</p>}

        {/* What it counts as */}
        {previewError ? (
          <p className="rounded-xl bg-status-dangerBg px-3 py-2 text-sm text-status-danger" role="alert">{previewError}</p>
        ) : preview && (
          <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink">
            <b>{daysLabel(preview.total)}</b> of leave
            {preview.skipped > 0 && <span className="text-ink-muted"> · {preview.skipped} weekly off day{preview.skipped === 1 ? "" : "s"} not counted</span>}
          </p>
        )}

        {/* Client visits on those days */}
        {!!preview?.visits.length && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">Client visits on your leave days</p>
            <p className="-mt-1 text-xs text-ink-muted">Reschedule each one to another day, or hand it over to a colleague, before sending.</p>
            {preview.visits.map((v) => {
              const c = choices[v.id] ?? { action: "", date: "", to: "" };
              return (
                <div key={v.id} className="space-y-2 rounded-xl border border-surface-border p-3">
                  <div>
                    <p className="break-words text-sm font-medium text-ink">{v.client}</p>
                    <p className="break-words text-xs text-ink-faint">{formatDate(v.date, { weekday: true })} · {v.title}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setChoice(v.id, { action: "reschedule" })} aria-pressed={c.action === "reschedule"}
                      className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm", c.action === "reschedule" ? "border-ink bg-ink text-white" : "border-surface-border text-ink-muted")}>
                      <CalendarClock className="h-4 w-4 shrink-0" /> Reschedule
                    </button>
                    <button onClick={() => setChoice(v.id, { action: "handover" })} aria-pressed={c.action === "handover"} disabled={!v.colleagues.length}
                      className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm disabled:opacity-40", c.action === "handover" ? "border-ink bg-ink text-white" : "border-surface-border text-ink-muted")}>
                      <UserRoundCheck className="h-4 w-4 shrink-0" /> Hand over
                    </button>
                  </div>
                  {c.action === "reschedule" && (
                    <input type="date" aria-label={`New date for ${v.client}`} value={c.date} min={today} onChange={(e) => setChoice(v.id, { date: e.target.value })}
                      className={cn(inputCls, c.date && leaveDays.has(c.date) && "border-status-danger")} />
                  )}
                  {c.action === "reschedule" && c.date && leaveDays.has(c.date) && <p className="text-xs text-status-danger">That day is part of your leave.</p>}
                  {c.action === "handover" && (
                    <select aria-label={`Colleague for ${v.client}`} value={c.to} onChange={(e) => setChoice(v.id, { to: e.target.value })} className={inputCls}>
                      <option value="">Choose a colleague</option>
                      {v.colleagues.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Field label="Reason">
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever, family function"
            className={cn(inputCls, "min-h-20")} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">Attachment (optional) — photo or PDF, up to 5 MB</span>
          {file ? (
            <div className="flex items-center gap-2 rounded-xl border border-surface-border px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink" title={file.name}>{file.name}</span>
              <button onClick={() => setFile(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border px-3 text-sm text-ink-muted hover:bg-surface">
              <Paperclip className="h-4 w-4" /> Add photo or PDF
              <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
