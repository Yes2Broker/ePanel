"use client";

import { useState } from "react";
import { FileCheck2, Lock, LockOpen } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDateTime, todayISO } from "@/lib/utils";
import { monthLabel } from "@/components/attendance/month-view";

const pill = "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium";

/** "🔒 Locked" next to a month (HR / Admin). */
export function LockBadge({ month }: { month: string }) {
  const { data } = useApi(() => api.attMonthStatus(month), [month]);
  if (!data?.locked) return null;
  return (
    <span className={`${pill} bg-status-warningBg text-status-warning`} title={data.lockedBy ? `Locked by ${data.lockedBy}` : undefined} data-testid="lock-badge">
      <Lock className="h-3.5 w-3.5" /> {monthLabel(month)} locked
    </span>
  );
}

/** Upload tab: which months are locked (their rows are skipped). */
export function LockedMonthsNote() {
  const { data } = useApi(() => api.attMonthStatus(todayISO().slice(0, 7)));
  if (!data?.lockedMonths.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted" data-testid="locked-months">
      <span className={`${pill} bg-status-warningBg text-status-warning`}><Lock className="h-3.5 w-3.5" /> Locked</span>
      {data.lockedMonths.map(monthLabel).join(", ")} — rows in {data.lockedMonths.length === 1 ? "this month are" : "these months are"} skipped.
    </p>
  );
}

type Action = "lock" | "unlock" | "publish" | "unpublish";
const CONFIRM: Record<Action, { title: string; text: (m: string) => string; button: string }> = {
  lock: { title: "Lock this month?", text: (m) => `No one can change ${m} attendance (edits, uploads, upload deletes) until it's unlocked.`, button: "Lock" },
  unlock: { title: "Unlock this month?", text: (m) => `HR can change ${m} attendance again.`, button: "Unlock" },
  publish: { title: "Publish payslips?", text: (m) => `Everyone gets their ${m} payslip with today's numbers, and the month is locked. You can re-publish later.`, button: "Publish" },
  unpublish: { title: "Unpublish payslips?", text: (m) => `Employees won't see their ${m} payslip any more. The month stays locked.`, button: "Unpublish" },
};

/** Salary sheet (Admin): lock / unlock the month and publish / unpublish payslips. */
export function SalaryMonthActions({ month }: { month: string }) {
  const toast = useToast();
  const status = useApi(() => api.attMonthStatus(month), [month]);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const s = status.data;
  const label = monthLabel(month);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const next = confirm === "lock" ? await api.attLockMonth(month, true)
        : confirm === "unlock" ? await api.attLockMonth(month, false)
        : confirm === "publish" ? await api.publishPayslips(month)
        : await api.unpublishPayslips(month);
      status.setData(next);
      toast({ lock: `${label} locked.`, unlock: `${label} unlocked.`, publish: `${label} payslips published.`, unpublish: `${label} payslips unpublished.` }[confirm]);
      setConfirm(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!s) return null;
  const c = confirm && CONFIRM[confirm];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {s.locked && (
          <span className={`${pill} bg-status-warningBg text-status-warning`} data-testid="lock-badge">
            <Lock className="h-3.5 w-3.5" /> Locked{s.lockedBy ? ` by ${s.lockedBy}` : ""}{s.lockedAt ? ` · ${formatDateTime(s.lockedAt)}` : ""}
          </span>
        )}
        {s.published && (
          <span className={`${pill} bg-status-successBg text-status-success`}>
            <FileCheck2 className="h-3.5 w-3.5" /> Payslips published{s.publishedAt ? ` · ${formatDateTime(s.publishedAt)}` : ""}
          </span>
        )}
        {s.locked
          ? <SecondaryButton onClick={() => setConfirm("unlock")} className="min-h-10"><LockOpen className="h-4 w-4" /> Unlock</SecondaryButton>
          : <SecondaryButton onClick={() => setConfirm("lock")} className="min-h-10"><Lock className="h-4 w-4" /> Lock {label}</SecondaryButton>}
        <SecondaryButton onClick={() => setConfirm("publish")} className="min-h-10"><FileCheck2 className="h-4 w-4" /> {s.published ? "Re-publish" : "Publish"} payslips for {label}</SecondaryButton>
        {s.published && <SecondaryButton onClick={() => setConfirm("unpublish")} className="min-h-10">Unpublish</SecondaryButton>}
      </div>
      <Modal open={!!c} onClose={() => setConfirm(null)} title={c?.title ?? ""} size="sm"
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton className="justify-center" onClick={() => setConfirm(null)}>Cancel</SecondaryButton>
          <PrimaryButton className="justify-center" disabled={busy} onClick={run}>{busy ? "Saving…" : c?.button}</PrimaryButton>
        </div>}>
        <p className="text-sm text-ink-muted">{c?.text(label)}</p>
      </Modal>
    </>
  );
}
