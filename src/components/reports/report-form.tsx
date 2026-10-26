"use client";

import { useMemo, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { DatePicker, Select, TimeInput } from "@/components/ui/pickers";
import { api, errorMessage } from "@/lib/api";
import { ReportFormData, ReportPayload, SalesReportDetail, VisitActionType } from "@/types";
import { addDays, cn } from "@/lib/utils";
import { longDate, nowHHMM, shortDate, time12 } from "@/lib/report-format";

const inputCls =
  "min-h-11 w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm disabled:bg-surface disabled:text-ink-muted";

interface SchedRow { key: string; id?: string; client: string; date: string; locked: boolean }
interface ActionState { action: VisitActionType | ""; time: string; date: string; reason: string }
interface FutureRow { visitId: string; time: string; frozen: boolean }

let tempSeq = 0;
const newTemp = () => `new-${++tempSeq}`;
const emptyAction: ActionState = { action: "", time: "", date: "", reason: "" };
const isCount = (v: string) => /^\d+$/.test(v.trim());

/** Resize a list to `n` items, keeping existing ones and padding with `make()`. Locked rows are never dropped. */
function resize<T extends { locked?: boolean }>(list: T[], n: number, make: () => T): T[] {
  const next = list.slice(0, n);
  const locked = list.slice(n).filter((r) => r.locked);
  while (next.length < n) next.push(make());
  return [...next, ...locked];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function ReportForm({
  form, onSaved, isManager,
}: { form: ReportFormData; onSaved: (r: SalesReportDetail) => void; isManager: boolean }) {
  const toast = useToast();
  const report = form.report;
  const imported = report?.source === "import";
  const sole = form.type === "Sole Selling";
  const date = form.date;
  const errorRef = useRef<HTMLDivElement>(null);

  const [num, setNum] = useState({
    leads: report ? String(report.leads) : "",
    calls: report ? String(report.calls) : "",
    positive: report ? String(report.positive) : "",
    tokens: report ? String(report.tokens) : "",
    scheduledCount: report ? String(report.scheduled) : "",
    doneCount: report ? String(report.done) : "",
    walkInCount: report ? String(report.walkIn) : "",
  });
  const [sched, setSched] = useState<SchedRow[]>(
    form.scheduled.map((s) => ({ key: s.id, id: s.id, client: s.client, date: s.date, locked: s.locked }))
  );
  const [schedCount, setSchedCount] = useState(report && !imported ? String(form.scheduled.length) : "");
  const [actions, setActions] = useState<Record<string, ActionState>>(() =>
    Object.fromEntries(form.todayVisits.filter((v) => v.action).map((v) => [v.id, {
      action: v.action!.action, time: v.action!.time ?? "", date: v.action!.date ?? "", reason: v.action!.reason ?? "",
    }]))
  );
  const [future, setFuture] = useState<FutureRow[]>(form.futureDone.map((f) => ({ ...f })));
  const [futureCount, setFutureCount] = useState(form.futureDone.length ? String(form.futureDone.length) : "");
  const [walkIns, setWalkIns] = useState<string[]>(form.walkIns);
  const [walkInCount, setWalkInCount] = useState(form.walkIns.length ? String(form.walkIns.length) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const frozenIds = new Set(form.todayVisits.filter((v) => v.action?.frozen).map((v) => v.id));

  // Today's visits = visits due today from earlier reports + visits booked in this form for today.
  const todayItems = useMemo(() => {
    const fromServer = form.todayVisits.filter((v) => !v.bookedHere).map((v) => ({
      key: v.id, visitId: v.id as string | undefined, tempId: undefined as string | undefined, client: v.client,
      note: v.overdue
        ? `Was due ${shortDate(v.rescheduleDate ?? v.visitDate)}`
        : v.rescheduleDate ? `Rescheduled from ${shortDate(v.visitDate)}` : `Booked ${shortDate(v.bookedOn)}`,
      overdue: v.overdue,
      frozen: frozenIds.has(v.id),
    }));
    const bookedHere = sched.filter((s) => s.date === date).map((s) => ({
      key: s.key, visitId: s.id, tempId: s.id ? undefined : s.key, client: s.client.trim() || "New visit",
      note: "Booked in this report", overdue: false, frozen: !!s.id && frozenIds.has(s.id),
    }));
    return [...fromServer, ...bookedHere];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.todayVisits, sched, date]);

  const usedFuture = new Set(future.map((f) => f.visitId).filter(Boolean));
  const maxTime = form.isToday ? nowHHMM() : undefined;

  const setNumField = (k: keyof typeof num, v: string) => setNum((n) => ({ ...n, [k]: v }));

  const onSchedCount = (v: string) => {
    setSchedCount(v);
    const n = isCount(v) ? Math.min(Number(v), 50) : 0;
    setSched((rows) => resize(rows, n, () => ({ key: newTemp(), client: "", date: "", locked: false })));
  };
  const onFutureCount = (v: string) => {
    setFutureCount(v);
    const n = isCount(v) ? Math.min(Number(v), form.futureVisits.length) : 0;
    setFuture((rows) => resize(rows.map((r) => ({ ...r, locked: r.frozen })), n, () => ({ visitId: "", time: "", frozen: false, locked: false })));
  };
  const onWalkInCount = (v: string) => {
    setWalkInCount(v);
    const n = isCount(v) ? Math.min(Number(v), 100) : 0;
    setWalkIns((rows) => rows.slice(0, n).concat(Array(Math.max(0, n - rows.length)).fill("")));
  };

  const fail = (msg: string) => {
    setError(msg);
    toast(msg, "error");
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  };

  const validate = () => {
    const fields: [keyof typeof num, string][] = [["leads", "Today Leads"], ["calls", "Today Calls"], ["positive", "Positive Calls"], ["tokens", "Tokens"]];
    if (imported) fields.push(["scheduledCount", "Visit Scheduled"], ["doneCount", "Site Visit Done"], ...(sole ? [["walkInCount", "Walk In"] as [keyof typeof num, string]] : []));
    for (const [k] of fields) if (!isCount(num[k])) return fail("Please enter valid positive numbers in all fields.");
    if (imported) return true;
    if (!isCount(schedCount || "0")) return fail("Please enter valid positive numbers in all fields.");
    for (const s of sched) {
      if (!s.client.trim() || !s.date) return fail("Fill all scheduled visit fields.");
      if (s.date < date) return fail(`Scheduled visit date for ${s.client} must be today or later.`);
    }
    const now = nowHHMM();
    for (const item of todayItems) {
      if (item.frozen) continue;
      const a = actions[item.key] ?? emptyAction;
      if (!a.action) return fail(`Select an action for ${item.client}.`);
      if (a.action === "done" && !a.time) return fail(`Enter time for ${item.client}`);
      if (a.action === "done" && !HHMM.test(a.time)) return fail(`Type the visit time for ${item.client} as HH:MM, e.g. 14:30.`);
      if (a.action === "done" && form.isToday && a.time > now) return fail(`Visit time for ${item.client} can't be in the future.`);
      if (a.action === "reschedule" && !a.date) return fail(`Select new date for ${item.client}`);
      if (a.action === "reschedule" && a.date <= date) return fail(`New date for ${item.client} must be from tomorrow.`);
      if (a.action === "cancel" && !a.reason.trim()) return fail(`Enter cancel reason for ${item.client}`);
    }
    for (const f of future) {
      if (!f.visitId) return fail("Select a visit for every \"future visit done\" row.");
      if (!f.time) return fail("Enter time for every future visit done.");
      if (!f.frozen && !HHMM.test(f.time)) return fail("Type visit times as HH:MM, e.g. 14:30.");
      if (!f.frozen && form.isToday && f.time > now) return fail("Visit time can't be in the future.");
    }
    if (sole && walkIns.some((w) => !w.trim())) return fail("Enter a client name for every walk-in.");
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    const payload: ReportPayload = {
      leads: Number(num.leads), calls: Number(num.calls), positive: Number(num.positive), tokens: Number(num.tokens),
      ...(imported ? { scheduledCount: Number(num.scheduledCount), doneCount: Number(num.doneCount), walkInCount: Number(num.walkInCount || 0) } : {}),
      scheduled: sched.map((s) => (s.id ? { id: s.id, client: s.client.trim(), date: s.date } : { tempId: s.key, client: s.client.trim(), date: s.date })),
      actions: todayItems.filter((i) => !i.frozen).map((i) => {
        const a = actions[i.key];
        return {
          ...(i.visitId ? { visitId: i.visitId } : { tempId: i.tempId }),
          action: a.action as VisitActionType,
          ...(a.action === "done" ? { time: a.time } : a.action === "reschedule" ? { date: a.date } : { reason: a.reason.trim() }),
        };
      }),
      futureDone: future.map((f) => ({ visitId: f.visitId, time: f.time })),
      walkIns: sole ? walkIns.map((w) => w.trim()) : [],
    };
    setSaving(true);
    try {
      const saved = await api.saveSalesReport({
        reportId: report?.id ?? null,
        employeeId: report ? null : form.employee.id,
        type: form.type, projectId: form.project?.id ?? null, date, payload,
      });
      toast(report ? "Report updated." : "Report submitted.");
      onSaved(saved);
    } catch (err) {
      fail(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-xl space-y-4">
      <Card className="p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{report ? "Edit report" : "New report"}</p>
        <h1 className="mt-0.5 text-lg font-semibold text-ink">{form.title}</h1>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm min-[400px]:grid-cols-2">
          <div><p className="text-xs text-ink-faint">Date</p><p className="font-medium text-ink">{longDate(date)}</p></div>
          <div><p className="text-xs text-ink-faint">Name</p><p className="font-medium text-ink">{form.employee.name}</p></div>
        </div>
        {imported && <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-xs text-ink-muted">Imported from the old sheet — only the numbers can be edited.</p>}
      </Card>

      <div ref={errorRef}>
        {error && <div className="rounded-xl bg-status-dangerBg px-4 py-3 text-sm text-status-danger" role="alert">{error}</div>}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <NumField label="Today Leads" value={num.leads} onChange={(v) => setNumField("leads", v)} required />
          <NumField label="Today Calls" value={num.calls} onChange={(v) => setNumField("calls", v)} required />
          <NumField label="Positive Calls" value={num.positive} onChange={(v) => setNumField("positive", v)} required />
          {imported
            ? <NumField label="Visit Scheduled" value={num.scheduledCount} onChange={(v) => setNumField("scheduledCount", v)} required />
            : <NumField label="Visit Scheduled Today" value={schedCount} onChange={onSchedCount} required />}
          {sole && (imported
            ? <NumField label="Walk In" value={num.walkInCount} onChange={(v) => setNumField("walkInCount", v)} />
            : <NumField label="Walk In" value={walkInCount} onChange={onWalkInCount} />)}
          {imported && <NumField label="Site Visit Done" value={num.doneCount} onChange={(v) => setNumField("doneCount", v)} required />}
          <div className={cn(!sole && !imported && "min-[400px]:col-span-2")}>
            <NumField label="Tokens" value={num.tokens} onChange={(v) => setNumField("tokens", v)} required />
          </div>
        </div>
      </Card>

      {!imported && (
        <>
          <Section title="Today's Scheduled Visits" empty={sched.length === 0 ? "Enter \"Visit Scheduled Today\" above to add visits." : null}>
            {sched.map((s, i) => (
              <div key={s.key} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[1fr_auto]">
                <input aria-label={`Scheduled visit ${i + 1} client name`} placeholder="Client Name" value={s.client} disabled={s.locked}
                  onChange={(e) => setSched((rows) => rows.map((r) => (r.key === s.key ? { ...r, client: e.target.value } : r)))} className={inputCls} />
                <DatePicker variant="field" ariaLabel={`Scheduled visit ${i + 1} date`} min={date} value={s.date} disabled={s.locked} className="min-[400px]:w-[10.5rem]"
                  onChange={(d) => setSched((rows) => rows.map((r) => (r.key === s.key ? { ...r, date: d } : r)))} />
                {s.locked && <p className="-mt-1 min-[400px]:col-span-2 flex items-center gap-1 text-xs text-ink-faint"><Lock className="h-3 w-3" /> Already acted on in a later report</p>}
              </div>
            ))}
          </Section>

          <Section title="Today's Visits Action" empty={todayItems.length === 0 ? "No visits today" : null}>
            {todayItems.map((item) => {
              const a = actions[item.key] ?? emptyAction;
              const set = (patch: Partial<ActionState>) => setActions((all) => ({ ...all, [item.key]: { ...(all[item.key] ?? emptyAction), ...patch } }));
              const serverAction = form.todayVisits.find((v) => v.id === item.visitId)?.action;
              return (
                <div key={item.key} className="space-y-2 border-b border-surface-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      {item.client}
                      {item.overdue && !item.frozen && <span className="rounded-full bg-status-dangerBg px-2 py-0.5 text-[11px] font-medium text-status-danger">Overdue</span>}
                    </p>
                    <p className="text-xs text-ink-faint">{item.note}</p>
                  </div>
                  {item.frozen ? (
                    <p className="flex items-center gap-1 text-sm text-ink-muted"><Lock className="h-3 w-3" />
                      {serverAction?.action === "done" ? `Done at ${time12(serverAction.time)}` : serverAction?.action === "reschedule" ? `Rescheduled to ${shortDate(serverAction.date)}` : `Cancelled`} — updated later in another report
                    </p>
                  ) : (
                    <>
                      <Select variant="field" ariaLabel={`Action for ${item.client}`} value={a.action} onChange={(v) => set({ action: v as VisitActionType })} placeholder="Select Action"
                        options={[{ value: "done", label: "Done" }, { value: "reschedule", label: "Reschedule" }, { value: "cancel", label: "Cancel" }]} />
                      {a.action === "done" && (
                        <TimeInput ariaLabel={`Visit time for ${item.client}`} max={maxTime} value={a.time} onChange={(t) => set({ time: t })} />
                      )}
                      {a.action === "reschedule" && (
                        <DatePicker variant="field" ariaLabel={`New date for ${item.client}`} min={addDays(date, 1)} value={a.date} onChange={(d) => set({ date: d })} placeholder="Pick the new date" />
                      )}
                      {a.action === "cancel" && (
                        <input aria-label={`Cancel reason for ${item.client}`} placeholder="Reason to cancel" value={a.reason} onChange={(e) => set({ reason: e.target.value })} className={inputCls} />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </Section>

          <Section title="Future Visit Done Today">
            {form.futureVisits.length === 0 && future.length === 0 ? (
              <p className="text-sm text-ink-faint">No future visits available</p>
            ) : (
              <>
                <input aria-label="Number of future visits done today" type="number" inputMode="numeric" min={0} max={form.futureVisits.length}
                  placeholder="How many?" value={futureCount} onChange={(e) => onFutureCount(e.target.value)} className={inputCls} />
                {future.map((f, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[1fr_auto]">
                    <Select variant="field" ariaLabel={`Future visit ${i + 1}`} value={f.visitId} disabled={f.frozen} placeholder="Select Visit"
                      onChange={(v) => setFuture((rows) => rows.map((r, j) => (j === i ? { ...r, visitId: v } : r)))}
                      options={form.futureVisits.map((v) => ({ value: v.id, label: `${v.client} - ${shortDate(v.date)}`, disabled: usedFuture.has(v.id) && v.id !== f.visitId }))} />
                    <TimeInput ariaLabel={`Future visit ${i + 1} time`} max={maxTime} value={f.time} disabled={f.frozen} className="min-[400px]:w-[8.5rem]"
                      onChange={(t) => setFuture((rows) => rows.map((r, j) => (j === i ? { ...r, time: t } : r)))} />
                  </div>
                ))}
              </>
            )}
          </Section>

          {sole && (
            <Section title="Today's Walk In" empty={walkIns.length === 0 ? "Enter \"Walk In\" above to add names." : null}>
              {walkIns.map((w, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[1fr_auto]">
                  <input aria-label={`Walk-in ${i + 1} client name`} placeholder="Client Name" value={w}
                    onChange={(e) => setWalkIns((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))} className={inputCls} />
                  <div aria-label={`Walk-in ${i + 1} date`} className={cn(inputCls, "flex items-center bg-surface text-ink-muted min-[400px]:w-[9.5rem]")}>{shortDate(date)}</div>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {/* Stays at the bottom of the screen, just above the phone bottom bar, while scrolling the form. */}
      <div className="sticky bottom-[var(--nav-h)] z-30 -mx-4 border-t border-surface-border bg-white/95 px-4 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-var(--nav-h)+0.75rem))] pt-3 backdrop-blur sm:mx-0 sm:rounded-t-card lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto max-w-xl">
          <PrimaryButton type="submit" disabled={saving} className="w-full justify-center py-3 text-base">
            {saving ? (report ? "Saving…" : "Submitting…") : report ? "Save changes" : "Submit Report"}
          </PrimaryButton>
          {report && !isManager && (
            <p className="mt-1.5 text-center text-xs text-ink-faint">You can edit this report until {new Date(report.editableUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>
          )}
        </div>
      </div>
    </form>
  );
}

function NumField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}{required && <span className="text-status-danger"> *</span>}</span>
      <input type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => onChange(e.target.value)}
        className={inputCls} />
    </label>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string | null; children?: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {empty ? <p className="text-sm text-ink-faint">{empty}</p> : children}
    </Card>
  );
}
