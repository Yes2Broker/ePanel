"use client";

import { useState } from "react";
import { Plus, CalendarHeart, BadgePlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/page";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { CompOffClaim } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import { LeaveCard, daysLabel } from "@/components/leave/leave-card";
import { ApplyLeave } from "@/components/leave/apply-leave";

/** The employee's own leave: apply, requests, comp-offs, holidays. */
export function MyLeave() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.leaveOverview());
  const [applyOpen, setApplyOpen] = useState(false);
  const [claiming, setClaiming] = useState<{ date: string; reason: string } | null>(null);
  const [showPast, setShowPast] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner message={error} onRetry={reload} />;

  const upcoming = data.applications.filter((a) => a.end >= data.today && (a.status === "Pending" || a.status === "Approved"));
  const past = data.applications.filter((a) => !upcoming.includes(a));
  const credits = data.claims.filter((c) => c.status === "Approved" && !c.expired && !c.usedBy);
  const otherClaims = data.claims.filter((c) => !credits.includes(c));
  const nextHolidays = data.holidays.filter((h) => h.date >= data.today);

  const cancelClaim = async (c: CompOffClaim) => {
    try { await api.compOffCancel(c.id); toast("Claim cancelled."); reload(); } catch (err) { toast(errorMessage(err), "error"); }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={reload} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4">
        <Card className="p-3 sm:p-4"><p className="text-xs text-ink-muted sm:text-sm">Leave this month</p><p className="text-xl font-semibold text-ink">{daysLabel(data.stats.month)}</p></Card>
        <Card className="p-3 sm:p-4"><p className="text-xs text-ink-muted sm:text-sm">Leave this year</p><p className="text-xl font-semibold text-ink">{daysLabel(data.stats.year)}</p></Card>
        <Card className="col-span-2 p-3 sm:col-span-1 sm:p-4"><p className="text-xs text-ink-muted sm:text-sm">Comp-off credits</p><p className="text-xl font-semibold text-ink">{credits.length}</p></Card>
      </div>

      {data.canApply ? (
        <PrimaryButton onClick={() => setApplyOpen(true)} className="w-full justify-center sm:w-auto"><Plus className="h-4 w-4" /> Apply for leave</PrimaryButton>
      ) : (
        <p className="rounded-xl bg-surface px-3 py-2 text-sm text-ink-muted">Leave is turned off for you. Contact HR or Admin.</p>
      )}
      <p className="text-xs text-ink-faint">All leave is unpaid. Your weekly off and company holidays are never counted. A comp-off makes a day paid.</p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">My leave</h2>
        {upcoming.length === 0 && <p className="text-sm text-ink-faint">No upcoming or pending leave.</p>}
        {upcoming.map((a) => <LeaveCard key={a.id} a={a} onChange={reload} />)}
        {past.length > 0 && (
          <SecondaryButton onClick={() => setShowPast((s) => !s)} className="min-h-10">{showPast ? "Hide" : "Show"} past and closed ({past.length})</SecondaryButton>
        )}
        {showPast && past.map((a) => <LeaveCard key={a.id} a={a} onChange={reload} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Comp-offs</h2>
        <p className="text-xs text-ink-faint">Filed a daily report on your weekly off or a company holiday? Claim a comp-off for it. Once approved, use it within 30 days of that date.</p>
        {data.claimable.map((d) => (
          <Card key={d.date} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{formatDate(d.date, { weekday: true })}</p>
              <p className="text-xs text-ink-faint">{d.reason} · report filed</p>
            </div>
            {data.canApply && <SecondaryButton onClick={() => setClaiming(d)} className="min-h-10 shrink-0"><BadgePlus className="h-4 w-4" /> Claim</SecondaryButton>}
          </Card>
        ))}
        {credits.map((c) => (
          <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Credit for {formatDate(c.workedDate, { weekday: true })}</p>
              <p className="text-xs text-ink-faint">{c.reason} · use by {formatDate(c.expires)}</p>
            </div>
            <StatusPill status="Approved" />
          </Card>
        ))}
        {otherClaims.map((c) => (
          <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Comp-off for {formatDate(c.workedDate, { weekday: true })}</p>
              <p className="break-words text-xs text-ink-faint">
                {c.usedBy ? `Used on ${formatDate(c.usedBy.date)}` : c.expired ? `Expired ${formatDate(c.expires)}` : c.reason}
                {c.decisionNote && ` · ${c.decisionNote}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {c.canCancel && <SecondaryButton onClick={() => cancelClaim(c)} className="min-h-10">Cancel</SecondaryButton>}
              <StatusPill status={c.usedBy ? "Used" : c.expired ? "Expired" : c.status} />
            </div>
          </Card>
        ))}
        {!data.claimable.length && !data.claims.length && <p className="text-sm text-ink-faint">No comp-offs.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Company holidays</h2>
        {nextHolidays.length === 0 ? (
          <EmptyState icon={CalendarHeart} title="No upcoming holidays" text="HR or Admin add them on the Leave page." />
        ) : (
          <Card className="divide-y divide-surface-border p-0">
            {nextHolidays.map((h) => (
              <div key={h.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="break-words text-sm text-ink">{h.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{formatDate(h.date, { weekday: true })}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <ApplyLeave open={applyOpen} onClose={() => setApplyOpen(false)} onDone={reload} credits={data.claims} />
      <ClaimDialog day={claiming} onClose={() => setClaiming(null)} onDone={() => { setClaiming(null); reload(); }} />
    </div>
  );
}

function ClaimDialog({ day, onClose, onDone }: { day: { date: string; reason: string } | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!day) return;
    setBusy(true);
    try {
      const c = await api.compOffClaim(day.date, note);
      toast(c.status === "Approved" ? "Comp-off added." : "Comp-off claim sent for approval.");
      setNote("");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!day} onClose={onClose} title="Claim a comp-off" size="sm"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton className="justify-center" onClick={onClose}>Back</SecondaryButton>
        <PrimaryButton className="justify-center" disabled={busy} onClick={submit}>Send claim</PrimaryButton>
      </div>}>
      {day && (
        <div className="space-y-3">
          <p className="text-sm text-ink">{formatDate(day.date, { weekday: true })} <span className="text-ink-muted">· {day.reason}</span></p>
          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Site visits at Nandanvan" className={cn(inputCls)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
