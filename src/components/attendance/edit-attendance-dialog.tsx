"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { ATTENDANCE_STATUSES } from "@/lib/constants";
import { TeamAttendanceRow } from "@/types";
import { formatDate, timeInputValue } from "@/lib/utils";

export interface AttendanceEdit {
  status: string;
  checkIn: string;
  checkOut: string;
  note: string;
}

export function EditAttendanceDialog({
  row, onClose, onSave, saving,
}: { row: TeamAttendanceRow | null; onClose: () => void; onSave: (edit: AttendanceEdit) => void; saving: boolean }) {
  const [form, setForm] = useState<AttendanceEdit>({ status: "Present", checkIn: "", checkOut: "", note: "" });

  useEffect(() => {
    if (row) {
      setForm({
        status: row.status ?? "Present",
        checkIn: timeInputValue(row.checkIn),
        checkOut: timeInputValue(row.checkOut),
        note: row.note,
      });
    }
  }, [row]);

  const noTimes = form.status === "Absent" || form.status === "Leave";

  return (
    <Modal open={!!row} onClose={onClose} title={row ? `${row.employee.name} — ${formatDate(row.date)}` : ""}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(noTimes ? { ...form, checkIn: "", checkOut: "" } : form);
        }}
        className="space-y-4"
      >
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
            {ATTENDANCE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {!noTimes && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Check in">
              <input type="time" required value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Check out">
              <input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={inputCls} />
            </Field>
          </div>
        )}
        <Field label="Note (visible to the employee)">
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Forgot to check in — confirmed by manager" className={inputCls} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
