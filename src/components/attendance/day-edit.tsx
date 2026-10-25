"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Loading } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { AttDay } from "@/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { AttPill, DayFlags, hours } from "@/components/attendance/att-format";

export interface EditTarget { employeeId: string; name: string; date: string; day: AttDay | null }

/**
 * HR/Admin edit of one day: In/Out, status (or "from the punches") and remark.
 * Late / Short Day recalculate on save. Every change is recorded.
 */
export function DayEdit({ target, onClose, onSaved }: { target: EditTarget | null; onClose: () => void; onSaved: (d: AttDay) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ in: "", out: "", status: "", remark: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const d = target.day;
    // A status the person can't be "set" to (Leave, Comp-off, Missed punch) means "from the punches".
    const settable = d && d.edited && ["Present", "Absent", "Weekoff", "Paid Leave"].includes(d.status) ? d.status : "";
    setForm({ in: d?.in ?? "", out: d?.out ?? "", status: settable, remark: d?.note && d.edited ? d.note : "" });
  }, [target]);

  const noTimes = form.status === "Absent" || form.status === "Weekoff" || form.status === "Paid Leave";
  const save = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const d = await api.attSetDay({ employeeId: target.employeeId, date: target.date, in: noTimes ? "" : form.in, out: noTimes ? "" : form.out, status: form.status, remark: form.remark });
      toast(`Saved ${target.name} · ${formatDate(target.date)}.`);
      onSaved(d);
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `${target.name}` : "Edit day"} subtitle={target ? formatDate(target.date, { weekday: true }) : undefined} size="sm"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton className="justify-center" onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton className="justify-center" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
      </div>}>
      {target && (
        <div className="space-y-4">
          {target.day && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <AttPill status={target.day.status} />
              <span className="text-ink-muted">{target.day.in ?? "—"} – {target.day.out ?? "—"} · {hours(target.day.minutes)}</span>
              <DayFlags d={target.day} />
            </div>
          )}
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
              <option value="">From the punches (automatic)</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Weekoff">Weekoff</option>
              <option value="Paid Leave">Paid Leave</option>
            </select>
          </Field>
          {!noTimes && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="In time"><input type="time" value={form.in} onChange={(e) => setForm({ ...form, in: e.target.value })} className={cn(inputCls, "min-w-0 px-2.5")} /></Field>
              <Field label="Out time"><input type="time" value={form.out} onChange={(e) => setForm({ ...form, out: e.target.value })} className={cn(inputCls, "min-w-0 px-2.5")} /></Field>
            </div>
          )}
          <Field label={form.status === "Paid Leave" ? "Remark (required)" : "Remark"}>
            <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder={form.status === "Paid Leave" ? "e.g. Birthday, Holi" : "Optional"} className={inputCls} />
          </Field>
          <p className="text-xs text-ink-faint">Late, Late Half and Short Day are worked out again after saving. Uploads never overwrite a day edited here.</p>
          <DayChanges employeeId={target.employeeId} date={target.date} />
        </div>
      )}
    </Modal>
  );
}

function DayChanges({ employeeId, date }: { employeeId: string; date: string }) {
  const { data, loading } = useApi(() => api.attDayChanges(employeeId, date), [employeeId, date]);
  if (loading && !data) return <Loading rows={2} />;
  if (!data?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-muted">History</p>
      <ol className="space-y-2">
        {data.map((c, i) => (
          <li key={i} className="border-l-2 border-brand pl-3 text-xs">
            <p className="text-ink-faint">{formatDateTime(c.at)} · {c.by ?? "—"}</p>
            <p className="break-words text-ink"><b className="font-medium">{c.field}:</b> <span className="text-ink-muted line-through">{c.old ?? "—"}</span> → {c.new ?? "—"}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
