"use client";

import { useState } from "react";
import { Check, X, Download, Trash2, Pencil, Plus, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { EmptyState, ErrorBanner, Loading, selectCls } from "@/components/ui/page";
import { inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { CompOffClaim } from "@/types";
import { cn, formatDate, todayISO } from "@/lib/utils";
import { LeaveCard, ReasonDialog, daysLabel } from "@/components/leave/leave-card";

const Segment = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) => (
  <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
    {options.map(([v, l]) => (
      <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
        className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium", value === v ? "bg-ink text-white" : "text-ink-muted")}>{l}</button>
    ))}
  </div>
);

/** Leave requests for HR/Admin: pending (with warnings), upcoming, recent. */
export function LeaveRequests({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<"Pending" | "Upcoming" | "All">("Pending");
  const { data, loading, error, reload } = useApi(() => api.leaveQueue(status), [status]);
  const refresh = () => { reload(); onChange?.(); };
  return (
    <div className="space-y-3">
      <Segment value={status} onChange={setStatus} options={[["Pending", "Pending"], ["Upcoming", "Approved"], ["All", "Recent"]]} />
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
        <EmptyState icon={Inbox} title={status === "Pending" ? "No pending requests" : "Nothing here"} />
      ) : (data ?? []).map((a) => <LeaveCard key={a.id} a={a} showPerson onChange={refresh} />)}
    </div>
  );
}

/** Comp-off claims for HR/Admin to approve. */
export function CompOffClaims({ onChange }: { onChange?: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<"Pending" | "All">("Pending");
  const { data, loading, error, reload } = useApi(() => api.compOffList(status), [status]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<CompOffClaim | null>(null);
  const decide = async (c: CompOffClaim, approve: boolean, note = "") => {
    setBusy(true);
    try {
      await api.compOffDecide(c.id, approve, note);
      toast(approve ? `Comp-off approved for ${c.employee.name}.` : "Claim rejected.");
      setRejecting(null);
      reload(); onChange?.();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <Segment value={status} onChange={setStatus} options={[["Pending", "Pending"], ["All", "Recent"]]} />
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
        <EmptyState icon={Inbox} title={status === "Pending" ? "No comp-off claims waiting" : "Nothing here"} />
      ) : (data ?? []).map((c) => (
        <Card key={c.id} className="space-y-2 p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-ink">{c.employee.name} <span className="font-normal text-ink-faint">· {c.employee.department}</span></p>
              <p className="text-sm text-ink">Worked {formatDate(c.workedDate, { weekday: true })}</p>
              <p className="break-words text-xs text-ink-muted">{c.reason}{c.reports?.length ? ` · filed: ${c.reports.join(", ")}` : ""} · expires {formatDate(c.expires)}</p>
            </div>
            <StatusPill status={c.usedBy ? "Used" : c.expired ? "Expired" : c.status} />
          </div>
          {c.note && <p className="break-words text-sm text-ink-muted"><span className="text-ink-faint">Note:</span> {c.note}</p>}
          {c.decisionNote && <p className="break-words text-xs text-ink-faint">{c.decidedBy}: {c.decisionNote}</p>}
          {c.canDecide && (
            <div className="flex justify-end gap-2">
              <SecondaryButton disabled={busy} onClick={() => setRejecting(c)} className="min-h-10"><X className="h-4 w-4" /> Reject</SecondaryButton>
              <PrimaryButton disabled={busy} onClick={() => decide(c, true)} className="min-h-10"><Check className="h-4 w-4" /> Approve</PrimaryButton>
            </div>
          )}
        </Card>
      ))}
      <ReasonDialog open={!!rejecting} title="Reject comp-off" label="Reason (shown to the employee)" action="Reject" busy={busy}
        onClose={() => setRejecting(null)} onSubmit={(note) => rejecting && decide(rejecting, false, note)} />
    </div>
  );
}

/** Company holidays: add, rename, remove. */
export function HolidaysManager() {
  const toast = useToast();
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)));
  const { data, loading, error, reload } = useApi(() => api.holidayList(year), [year]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ date: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (d: string, n: string, done: string) => {
    setBusy(true);
    try { await api.holidaySave(d, n); toast(done); setEditing(null); setDate(""); setName(""); reload(); }
    catch (err) { toast(errorMessage(err), "error"); }
    finally { setBusy(false); }
  };
  const remove = async (d: string) => {
    if (!window.confirm("Remove this holiday?")) return;
    try { await api.holidayDelete(d); toast("Holiday removed."); reload(); } catch (err) { toast(errorMessage(err), "error"); }
  };
  return (
    <div className="max-w-2xl space-y-3">
      <Card className="p-3.5 sm:p-4">
        <form onSubmit={(e) => { e.preventDefault(); if (date && name.trim()) save(date, name.trim(), "Holiday added."); }} className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto]">
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Holiday date" className={cn(inputCls, "sm:w-44")} />
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Diwali" aria-label="Holiday name" className={inputCls} />
          <PrimaryButton type="submit" disabled={busy || !date || !name.trim()} className="justify-center"><Plus className="h-4 w-4" /> Add</PrimaryButton>
        </form>
        <p className="mt-2 text-xs text-ink-faint">Holidays are never counted as leave. A daily report filed on a holiday can be claimed as a comp-off.</p>
      </Card>
      <div className="flex items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls} aria-label="Year">
          {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      <Card className="overflow-hidden p-0">
        {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">No holidays for {year}.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {(data ?? []).map((h) => (
              <li key={h.date} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm text-ink-muted">{formatDate(h.date, { weekday: true })}</span>
                {editing?.date === h.date ? (
                  <form onSubmit={(e) => { e.preventDefault(); save(h.date, editing.name, "Renamed."); }} className="flex min-w-0 flex-1 gap-2">
                    <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Holiday name" className={cn(inputCls, "min-w-0 flex-1")} />
                    <button type="submit" disabled={busy} className="flex h-11 w-11 items-center justify-center rounded-lg text-status-success hover:bg-surface" aria-label="Save name"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEditing(null)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-surface" aria-label="Cancel"><X className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{h.name}</span>
                    <button onClick={() => setEditing(h)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-faint hover:bg-surface" aria-label={`Rename ${h.name}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => remove(h.date)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-faint hover:bg-surface hover:text-status-danger" aria-label={`Remove ${h.name}`}><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Monthly unpaid-leave summary per employee, with a CSV for salary. */
export function LeaveSummary() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data, loading, error, reload } = useApi(() => api.leaveMonthSummary(`${month}-01`), [month]);
  const rows = data ?? [];
  const download = () => {
    const lines = [["Employee ID", "Name", "Department", "Unpaid leave days", "Comp-off days (paid)", "Half days", "Total days off"],
      ...rows.map((r) => [r.employee.id, r.employee.name, r.employee.department, r.unpaid, r.compOff, r.halfDays, r.total])];
    const blob = new Blob(["﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leave-summary-${month}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={month} max={todayISO().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month"
          className={cn(selectCls, "text-sm")} />
        <SecondaryButton onClick={download} disabled={!rows.length} className="min-h-10"><Download className="h-4 w-4" /> Download CSV</SecondaryButton>
      </div>
      <p className="text-xs text-ink-faint">Approved leave only. Weekly offs and holidays are not counted. Half days count 0.5.</p>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.employee.id}>
                <Card className="p-3">
                  <p className="break-words text-sm font-medium text-ink">{r.employee.name}</p>
                  <p className="text-xs text-ink-faint">{r.employee.id} · {r.employee.department}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface p-1.5"><dt className="text-[0.6875rem] text-ink-faint">Unpaid</dt><dd className="text-sm font-semibold text-ink">{r.unpaid}</dd></div>
                    <div className="rounded-lg bg-surface p-1.5"><dt className="text-[0.6875rem] text-ink-faint">Comp-off</dt><dd className="text-sm font-semibold text-ink">{r.compOff}</dd></div>
                    <div className="rounded-lg bg-surface p-1.5"><dt className="text-[0.6875rem] text-ink-faint">Half days</dt><dd className="text-sm font-semibold text-ink">{r.halfDays}</dd></div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-xs text-ink-faint">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 text-right font-medium">Unpaid days</th>
                  <th className="px-3 py-2 text-right font-medium">Comp-off days</th>
                  <th className="px-3 py-2 text-right font-medium">Half days</th>
                  <th className="px-4 py-2 text-right font-medium">Total off</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="border-t border-surface-border">
                    <td className="px-4 py-2"><p className="font-medium text-ink">{r.employee.name}</p><p className="text-xs text-ink-faint">{r.employee.id} · {r.employee.department}</p></td>
                    <td className="px-3 py-2 text-right">{r.unpaid}</td>
                    <td className="px-3 py-2 text-right">{r.compOff}</td>
                    <td className="px-3 py-2 text-right">{r.halfDays}</td>
                    <td className="px-4 py-2 text-right font-semibold">{daysLabel(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
