"use client";

import { useState } from "react";
import { AlertTriangle, Paperclip, History, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/pickers";
import { StatusPill } from "@/components/ui/pills";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { Loading } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { LeaveApplication } from "@/types";
import { cn, formatDate, formatDateTime, todayISO } from "@/lib/utils";

export const daysLabel = (n: number) => `${Number(n.toFixed(1))} day${n === 1 ? "" : "s"}`;

function rangeLabel(a: { start: string; end: string; half: string | null }) {
  if (a.half) return `${formatDate(a.start, { weekday: true })} · ${a.half === "first" ? "first" : "second"} half`;
  if (a.start === a.end) return formatDate(a.start, { weekday: true });
  return `${formatDate(a.start, { weekday: true })} – ${formatDate(a.end, { weekday: true })}`;
}

/** Opens (or downloads) the attachment of a leave. */
async function openAttachment(id: string) {
  const f = await api.leaveAttachment(id);
  if (!f) return;
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  if (!f.mime.startsWith("image/") && f.mime !== "application/pdf") a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * One leave application. Shows the person (approver views), dates, status,
 * reason, warnings and what the viewer may do: cancel, cancel the remaining
 * days, approve / reject, see the history.
 */
export function LeaveCard({ a, showPerson, onChange }: { a: LeaveApplication; showPerson?: boolean; onChange: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState<"all" | "rest" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      onChange();
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2.5 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showPerson && (
            <p className="break-words text-sm font-semibold text-ink">
              {a.employee.name} <span className="font-normal text-ink-faint">· {a.employee.department}</span>
            </p>
          )}
          <p className={cn("break-words text-sm text-ink", !showPerson && "font-semibold")}>{rangeLabel(a)}</p>
          <p className="text-xs text-ink-muted">
            {daysLabel(a.days)}
            {a.cancelledFrom && ` · cancelled from ${formatDate(a.cancelledFrom)}`}
          </p>
        </div>
        <StatusPill status={a.status} />
      </div>

      <p className="break-words text-sm text-ink-muted"><span className="text-ink-faint">Reason:</span> {a.reason}</p>

      {a.taken && (
        <p className="text-xs text-ink-muted">Leave taken: <b className="text-ink">{daysLabel(a.taken.month)}</b> this month · <b className="text-ink">{daysLabel(a.taken.year)}</b> this year</p>
      )}

      {!!a.warnings?.length && (
        <ul className="space-y-1 rounded-xl bg-status-warningBg/70 p-2.5 text-xs text-status-warning">
          {a.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{w}</span></li>)}
        </ul>
      )}

      {!!a.visitChanges?.length && (
        <ul className="space-y-0.5 rounded-xl bg-surface p-2.5 text-xs text-ink-muted">
          {a.visitChanges.map((v) => <li key={v} className="break-words">{v}</li>)}
        </ul>
      )}

      {(a.decisionNote || a.cancelNote) && (
        <p className="break-words text-xs text-ink-faint">
          {a.decisionNote && <>{a.status === "Rejected" ? "Rejected" : "Note"} by {a.decidedBy}: {a.decisionNote}. </>}
          {a.cancelNote && <>Cancelled by {a.cancelledBy}: {a.cancelNote}</>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {a.attachment && (
          <button onClick={() => openAttachment(a.id).catch((e) => toast(errorMessage(e), "error"))}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-ink-muted hover:text-ink">
            <Paperclip className="h-3.5 w-3.5" /> <span className="max-w-[10rem] truncate" title={a.attachment.name}>{a.attachment.name}</span>
          </button>
        )}
        <button onClick={() => setHistoryOpen(true)} className="flex min-h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-medium text-ink-muted hover:text-ink">
          <History className="h-3.5 w-3.5" /> History
        </button>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {a.canCancel && <SecondaryButton disabled={busy} onClick={() => setCancelling("all")} className="min-h-10">Cancel</SecondaryButton>}
          {a.canCancelRemaining && <SecondaryButton disabled={busy} onClick={() => setCancelling("rest")} className="min-h-10">Cancel remaining days</SecondaryButton>}
          {a.canDecide && (
            <>
              <SecondaryButton disabled={busy} onClick={() => setRejecting(true)} className="min-h-10"><X className="h-4 w-4" /> Reject</SecondaryButton>
              <PrimaryButton disabled={busy} onClick={() => run(() => api.leaveDecide(a.id, true, ""), `Approved ${a.employee.name}'s leave.`)} className="min-h-10">
                <Check className="h-4 w-4" /> Approve
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      <ReasonDialog
        open={rejecting} title="Reject leave" label="Reason (shown to the employee)" action="Reject" busy={busy}
        onClose={() => setRejecting(false)}
        onSubmit={async (note) => { if (await run(() => api.leaveDecide(a.id, false, note), "Leave rejected.")) setRejecting(false); }}
      />
      <CancelDialog
        a={a} mode={cancelling} busy={busy} onClose={() => setCancelling(null)}
        onSubmit={async (from, note) => { if (await run(() => api.leaveCancel(a.id, from, note), cancelling === "rest" ? "Remaining days cancelled." : "Leave cancelled.")) setCancelling(null); }}
      />
      {historyOpen && <LeaveTimeline id={a.id} onClose={() => setHistoryOpen(false)} />}
    </Card>
  );
}

function ReasonDialog({ open, title, label, action, busy, onClose, onSubmit }: {
  open: boolean; title: string; label: string; action: string; busy: boolean; onClose: () => void; onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton className="justify-center" onClick={onClose}>Back</SecondaryButton>
        <PrimaryButton className="justify-center" disabled={busy || !note.trim()} onClick={() => onSubmit(note.trim())}>{action}</PrimaryButton>
      </div>}>
      <Field label={label}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputCls, "min-h-24")} autoFocus />
      </Field>
    </Modal>
  );
}

function CancelDialog({ a, mode, busy, onClose, onSubmit }: {
  a: LeaveApplication; mode: "all" | "rest" | null; busy: boolean; onClose: () => void; onSubmit: (from: string | null, note: string) => void;
}) {
  const today = todayISO();
  const lastDay = a.dayList.length ? a.dayList[a.dayList.length - 1].date : a.end;
  const [from, setFrom] = useState(today < a.start ? a.start : today);
  const [note, setNote] = useState("");
  return (
    <Modal open={!!mode} onClose={onClose} title={mode === "rest" ? "Cancel remaining days" : "Cancel leave"} size="sm"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton className="justify-center" onClick={onClose}>Back</SecondaryButton>
        <PrimaryButton className="justify-center" disabled={busy} onClick={() => onSubmit(mode === "rest" ? from : null, note.trim())}>
          {mode === "rest" ? "Cancel these days" : "Cancel leave"}
        </PrimaryButton>
      </div>}>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{rangeLabel(a)} · {daysLabel(a.days)}</p>
        {mode === "rest" && (
          <Field label="Cancel from (this day and after)">
            <DatePicker variant="field" ariaLabel="Cancel from" value={from} min={a.start} max={lastDay} onChange={setFrom} />
          </Field>
        )}
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </Field>
      </div>
    </Modal>
  );
}

function LeaveTimeline({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useApi(() => api.leaveTimeline(id), [id]);
  return (
    <Modal open onClose={onClose} title="History" size="sm">
      {loading && !data && <Loading rows={3} />}
      {error && <p className="text-sm text-status-danger">{error}</p>}
      <ol className="space-y-3">
        {(data ?? []).map((h, i) => (
          <li key={i} className="border-l-2 border-brand pl-3 text-sm">
            <p className="text-xs text-ink-faint">{formatDateTime(h.at)} · {h.by ?? "—"}</p>
            <p className="font-medium text-ink">{h.action}</p>
            {h.details && <p className="break-words text-ink-muted">{h.details}</p>}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
