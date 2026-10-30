"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { CheckRow } from "@/components/ui/checkbox";
import { EmptyState, ErrorBanner, Loading, tableHeadCls } from "@/components/ui/page";
import { DatePicker, MonthField } from "@/components/ui/pickers";
import { Field, Modal, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn, formatDate, todayISO } from "@/lib/utils";
import type { Employee, PaidLeave, PaidLeaveInput, PaidLeaveScope } from "@/types";

const blank = (): PaidLeaveInput => ({ from: todayISO(), to: todayISO(), reason: "", halfDay: false, scope: "all", departments: [], employees: [] });
const dates = (p: { from: string; to: string }) => (p.from === p.to ? formatDate(p.from, { weekday: true }) : `${formatDate(p.from)} – ${formatDate(p.to)}`);
const who = (p: PaidLeave) => (p.scope === "all" ? "All employees" : p.scope === "departments" ? p.departments.join(", ") : p.employees.map((e) => e.name).join(", "));

/**
 * Attendance → Paid Leaves (HR/Admin): days off that count as paid leave, for
 * everyone, departments or people (supabase/attendance.sql, paid_leaves). Week
 * offs are skipped and new joiners only from their joining date, on the server.
 */
export function PaidLeaves() {
  const toast = useToast();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [search, setSearch] = useState("");
  const list = useApi(() => api.paidLeaves(month), [month]);
  const people = useApi(() => api.listEmployees(), []);
  const [form, setForm] = useState<{ id: string | null; data: PaidLeaveInput } | null>(null);
  const [deleting, setDeleting] = useState<PaidLeave | null>(null);
  const [busy, setBusy] = useState(false);

  const q = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter((p) => !q || p.reason.toLowerCase().includes(q) || who(p).toLowerCase().includes(q));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await api.savePaidLeave(form.id, form.data);
      toast(form.id ? "Paid leave updated." : "Paid leave added.");
      setForm(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deletePaidLeave(deleting.id);
      toast("Paid leave deleted.");
      setDeleting(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => setForm({ id: null, data: blank() })}><Plus className="h-4 w-4" /> Add paid leave</PrimaryButton>
        <MonthField ariaLabel="Month" value={month} onChange={setMonth} />
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or reason" aria-label="Search paid leaves" className={cn(inputCls, "pl-9")} />
        </label>
      </div>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Loading /> : !rows.length ? (
        <EmptyState icon={Plus} title="No paid leaves" text={q ? "Nothing matches your search." : "Add Diwali, a birthday or any day off that should be paid."} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className={tableHeadCls}><th className="px-4 py-2.5">Date(s)</th><th className="px-3">Who</th><th className="px-3">Reason</th><th className="px-3">Type</th><th className="px-3">Added by</th><th className="px-3" /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-surface-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5">{dates(p)}</td>
                  <td className="max-w-[16rem] px-3 py-2.5">{who(p)}</td>
                  <td className="px-3 py-2.5">{p.reason}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{p.halfDay ? "Half day" : "Full day"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{p.createdBy ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button aria-label={`Edit ${p.reason}`} onClick={() => setForm({ id: p.id, data: { from: p.from, to: p.to, reason: p.reason, halfDay: p.halfDay, scope: p.scope, departments: p.departments, employees: p.employees.map((e) => e.id) } })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"><Pencil className="h-4 w-4" /></button>
                    <button aria-label={`Delete ${p.reason}`} onClick={() => setDeleting(p)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {form && <PaidLeaveForm form={form} setForm={setForm} employees={people.data ?? []} busy={busy} onSave={save} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Delete paid leave?" size="sm"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={remove} disabled={busy} className="bg-status-danger hover:bg-status-danger/90">Delete</PrimaryButton></div>}>
          <p className="text-sm text-ink">{deleting.reason} · {dates(deleting)} · {who(deleting)}. Those days stop counting as paid leave.</p>
        </Modal>
      )}
    </div>
  );
}

function PaidLeaveForm({ form, setForm, employees, busy, onSave }: {
  form: { id: string | null; data: PaidLeaveInput }; setForm: (f: { id: string | null; data: PaidLeaveInput } | null) => void;
  employees: Employee[]; busy: boolean; onSave: () => void;
}) {
  const d = form.data;
  const set = (patch: Partial<PaidLeaveInput>) => setForm({ ...form, data: { ...d, ...patch } });
  const [find, setFind] = useState("");
  const staff = useMemo(() => employees.filter((e) => e.role !== "Admin" && e.status === "Active").sort((a, b) => a.name.localeCompare(b.name)), [employees]);
  // Departments come from the live employee list (new ones appear by themselves).
  const departments = useMemo(() => Array.from(new Set(staff.map((e) => e.department))).sort(), [staff]);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const shown = staff.filter((e) => !find.trim() || e.name.toLowerCase().includes(find.trim().toLowerCase()) || e.id.toLowerCase().includes(find.trim().toLowerCase()));
  const scopes: { value: PaidLeaveScope; label: string }[] = [{ value: "all", label: "All employees" }, { value: "departments", label: "Department(s)" }, { value: "employees", label: "Employee(s)" }];

  return (
    <Modal open onClose={() => setForm(null)} title={form.id ? "Edit paid leave" : "Add paid leave"} size="md"
      footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
        <PrimaryButton onClick={onSave} disabled={busy || !d.reason.trim() || !d.from}>{busy ? "Saving…" : "Save"}</PrimaryButton></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><DatePicker variant="field" value={d.from} onChange={(v) => set({ from: v, to: d.to < v ? v : d.to })} ariaLabel="From" /></Field>
          <Field label="To"><DatePicker variant="field" value={d.to} min={d.from} onChange={(v) => set({ to: v })} ariaLabel="To" /></Field>
        </div>
        <Field label="Who">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who">
            {scopes.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={d.scope === s.value} onClick={() => set({ scope: s.value })}
                className={cn("min-h-10 rounded-pill border px-3.5 text-sm", d.scope === s.value ? "border-brand bg-brand-soft font-medium text-brand" : "border-surface-border text-ink hover:bg-surface")}>{s.label}</button>
            ))}
          </div>
        </Field>
        {d.scope === "departments" && (
          <div className="grid grid-cols-2 gap-2">
            {departments.map((x) => <CheckRow key={x} label={x} checked={d.departments.includes(x)} onChange={() => set({ departments: toggle(d.departments, x) })} />)}
          </div>
        )}
        {d.scope === "employees" && (
          <div className="space-y-2">
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search employees" aria-label="Search employees" className={inputCls} />
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {shown.map((e) => <CheckRow key={e.id} label={e.name} note={`${e.id} · ${e.department}`} checked={d.employees.includes(e.id)} onChange={() => set({ employees: toggle(d.employees, e.id) })} />)}
            </div>
            {d.employees.length > 0 && <p className="text-xs text-ink-muted">{d.employees.length} selected</p>}
          </div>
        )}
        <Field label="Reason"><input value={d.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={80} placeholder="e.g. Diwali, Birthday" className={inputCls} /></Field>
        <Field label="Type">
          <div className="flex gap-2" role="radiogroup" aria-label="Type">
            {[false, true].map((half) => (
              <button key={String(half)} type="button" role="radio" aria-checked={d.halfDay === half} onClick={() => set({ halfDay: half })}
                className={cn("min-h-10 rounded-pill border px-3.5 text-sm", d.halfDay === half ? "border-brand bg-brand-soft font-medium text-brand" : "border-surface-border text-ink hover:bg-surface")}>{half ? "Half day" : "Full day"}</button>
            ))}
          </div>
        </Field>
        <p className="text-xs text-ink-muted">Weekly offs are skipped. &quot;All employees&quot; and departments mean whoever is working here on that day, so later joiners are added for future dates.</p>
      </div>
    </Modal>
  );
}

/** The signed-in person's upcoming paid leave days (their Attendance page). */
export function MyPaidLeaves() {
  const { data } = useApi(() => api.myPaidLeaves(), []);
  if (!data?.length) return null;
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">Upcoming paid leaves</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {data.slice(0, 8).map((d) => (
          <li key={d.date} className="rounded-pill bg-brand-soft px-3 py-1 text-xs text-brand">
            {formatDate(d.date, { weekday: true })} · {d.reason}{d.halfDay ? " (half day)" : ""}
          </li>
        ))}
      </ul>
    </Card>
  );
}
