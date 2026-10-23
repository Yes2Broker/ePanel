"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { LEAVE_TYPES } from "@/lib/constants";
import { LeaveRequest, LeaveType } from "@/types";
import { formatDate, todayISO } from "@/lib/utils";

export function RequestLeaveDialog({
  open, onClose, onSave, saving,
}: { open: boolean; onClose: () => void; onSave: (v: { type: LeaveType; start: string; end: string; reason: string }) => void; saving: boolean }) {
  const [type, setType] = useState<LeaveType>("Casual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setType("Casual");
      setStart(todayISO());
      setEnd(todayISO());
      setReason("");
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Request leave">
      <form onSubmit={(e) => { e.preventDefault(); onSave({ type, start, end, reason }); }} className="space-y-4">
        <Field label="Leave type">
          <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={inputCls}>
            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <input type="date" required value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" required value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Reason">
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short note for HR" className={inputCls} />
        </Field>
        <p className="text-xs text-ink-faint">Sundays inside the range aren&apos;t counted. HR or Admin will approve or reject the request.</p>
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Sending…" : "Send request"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export function ReviewLeaveDialog({
  request, onClose, onReview, saving,
}: { request: LeaveRequest | null; onClose: () => void; onReview: (approve: boolean, note: string) => void; saving: boolean }) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [request]);

  return (
    <Modal open={!!request} onClose={onClose} title="Review leave request">
      {request && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Detail label="Employee" value={request.employeeName} />
            <Detail label="Type" value={`${request.type} leave`} />
            <Detail label="Dates" value={`${formatDate(request.startDate)} – ${formatDate(request.endDate)}`} />
            <Detail label="Working days" value={String(request.days)} />
            <div className="col-span-2"><Detail label="Reason" value={request.reason || "—"} /></div>
          </div>
          <Field label="Note to employee (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <SecondaryButton type="button" disabled={saving} onClick={() => onReview(false, note)}>Reject</SecondaryButton>
            <PrimaryButton type="button" disabled={saving} onClick={() => onReview(true, note)}>{saving ? "Saving…" : "Approve"}</PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
