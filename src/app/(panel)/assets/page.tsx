"use client";

import { useMemo, useState } from "react";
import { History, Pencil, Plus, Search, Smartphone, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs, tableHeadCls } from "@/components/ui/page";
import { DatePicker, Select } from "@/components/ui/pickers";
import { Field, Modal, inputCls } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/pills";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn, formatDate, todayISO } from "@/lib/utils";
import type { Asset, AssetInput, AssetKind, AssetStatus } from "@/types";

const KIND = {
  sim: { tab: "SIM cards", one: "SIM", field: "Number", typeLabel: "Operator", types: ["Jio", "Airtel", "Vi", "BSNL", "Other"] },
  email: { tab: "Email accounts", one: "email", field: "Email", typeLabel: "Provider", types: ["Gmail", "Other"] },
} as const;
const STATUSES: AssetStatus[] = ["Assigned", "Idle", "Blocked"];

/**
 * SIMs & Emails (HR/Admin): company SIM cards and email accounts, who has them
 * and since when, with history (supabase/assets.sql). Passwords are never kept.
 */
export default function AssetsPage() {
  const toast = useToast();
  const [kind, setKind] = useState<AssetKind>("sim");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const list = useApi(() => api.assetsList(), []);
  const people = useApi(() => api.listEmployees(), []);
  const [form, setForm] = useState<{ id: string | null; data: AssetInput } | null>(null);
  const [assigning, setAssigning] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [history, setHistory] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const k = KIND[kind];
  const items = (kind === "sim" ? list.data?.sims : list.data?.emails) ?? [];
  const active = useMemo(() => (people.data ?? []).filter((e) => e.status === "Active").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [people.data]);
  // One company SIM and one company email per person: only people without one of this kind
  // (plus whoever already holds the item being edited).
  const holders = new Set(items.map((a) => a.employee?.id).filter(Boolean));
  const empOptions = (keep?: string) => active.filter((e) => !holders.has(e.id) || e.id === keep).map((e) => ({ value: e.id, label: `${e.name} (${e.id})` }));
  const [freeing, setFreeing] = useState<Asset | null>(null);
  const q = search.trim().toLowerCase();
  const rows = items.filter((a) => (status === "All" || a.status === status)
    && (!q || a.label.toLowerCase().includes(q) || a.employee?.name.toLowerCase().includes(q) || a.note.toLowerCase().includes(q)));
  const count = (s?: AssetStatus) => items.filter((a) => !s || a.status === s).length;

  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); toast(ok); after?.(); list.reload(); } catch (err) { toast(errorMessage(err), "error"); } finally { setBusy(false); }
  };
  const blank = (): AssetInput => ({ label: "", type: k.types[0], status: "Idle", employeeId: "", since: todayISO(), note: "" });

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="SIMs & Emails" subtitle="Company SIM cards and email accounts: who has them, since when, and before." />
      <Tabs tabs={[{ value: "sim" as AssetKind, label: KIND.sim.tab }, { value: "email" as AssetKind, label: KIND.email.tab }]} value={kind} onChange={(v) => { setKind(v); setStatus("All"); }} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["Total", ...STATUSES] as const).map((s) => (
          <Card key={s} className="p-3">
            <p className="text-xs text-ink-muted">{s === "Total" ? "Total" : s}</p>
            <p className="text-2xl font-semibold text-ink">{count(s === "Total" ? undefined : s)}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => setForm({ id: null, data: blank() })}><Plus className="h-4 w-4" /> Add {k.one}</PrimaryButton>
        <Select ariaLabel="Status" value={status} onChange={setStatus} options={["All", ...STATUSES].map((s) => ({ value: s, label: s === "All" ? "All statuses" : s }))} />
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${kind === "sim" ? "number" : "email"}, name or note`} aria-label="Search" className={cn(inputCls, "pl-9")} />
        </label>
      </div>
      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Loading /> : !rows.length ? (
        <EmptyState icon={Smartphone} title={`No ${k.tab.toLowerCase()}`} text={q || status !== "All" ? "Nothing matches." : `Add the company's ${k.tab.toLowerCase()} here.`} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead><tr className={tableHeadCls}><th className="px-4 py-2.5">{k.field}</th><th className="px-3">{k.typeLabel}</th><th className="px-3">Status</th><th className="px-3">Assigned to</th><th className="px-3">Since</th><th className="px-3">Note</th><th className="px-3" /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-surface-border">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{a.label}</td>
                  <td className="px-3 py-2.5">{a.type}</td>
                  <td className="px-3 py-2.5"><StatusPill status={a.status} /></td>
                  <td className="px-3 py-2.5">{a.employee ? `${a.employee.name} (${a.employee.id})` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{a.since ? formatDate(a.since) : "—"}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-ink-muted" title={a.note}>{a.note || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {a.status === "Assigned"
                      ? <SecondaryButton className="mr-1 min-h-9 px-3 py-1 text-xs" disabled={busy} onClick={() => setFreeing(a)}><UserMinus className="h-3.5 w-3.5" /> Free</SecondaryButton>
                      : <SecondaryButton className="mr-1 min-h-9 px-3 py-1 text-xs" disabled={busy} onClick={() => setAssigning(a)}><UserPlus className="h-3.5 w-3.5" /> Assign</SecondaryButton>}
                    <Icon label={`History of ${a.label}`} onClick={() => setHistory(a)}><History className="h-4 w-4" /></Icon>
                    <Icon label={`Edit ${a.label}`} onClick={() => setForm({ id: a.id, data: { label: a.label, type: a.type, status: a.status, employeeId: a.employee?.id ?? "", since: a.since ?? todayISO(), note: a.note } })}><Pencil className="h-4 w-4" /></Icon>
                    <Icon label={`Delete ${a.label}`} danger onClick={() => setDeleting(a)}><Trash2 className="h-4 w-4" /></Icon>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {form && (
        <Modal open onClose={() => setForm(null)} title={`${form.id ? "Edit" : "Add"} ${k.one}`} size="md"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
            <PrimaryButton disabled={busy || !form.data.label.trim() || (form.data.status === "Assigned" && !form.data.employeeId)}
              onClick={() => run(() => api.assetSave(kind, form.id, form.data), form.id ? "Saved." : `${k.one === "SIM" ? "SIM" : "Email"} added.`, () => setForm(null))}>Save</PrimaryButton></div>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={k.field}>
              <input value={form.data.label} onChange={(e) => setForm({ ...form, data: { ...form.data, label: e.target.value } })} className={inputCls}
                inputMode={kind === "sim" ? "numeric" : "email"} maxLength={kind === "sim" ? 14 : 120} placeholder={kind === "sim" ? "10-digit number" : "name@company.com"} />
            </Field>
            <Field label={k.typeLabel}><Select variant="field" value={form.data.type} onChange={(v) => setForm({ ...form, data: { ...form.data, type: v } })} options={k.types.map((t) => ({ value: t, label: t }))} /></Field>
            <Field label="Status"><Select variant="field" value={form.data.status} onChange={(v) => setForm({ ...form, data: { ...form.data, status: v as AssetStatus } })} options={STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
            {form.data.status === "Assigned" && <>
              <Field label="Assigned to"><Select variant="field" ariaLabel="Assigned to" value={form.data.employeeId} onChange={(v) => setForm({ ...form, data: { ...form.data, employeeId: v } })} options={empOptions(form.id ? items.find((x) => x.id === form.id)?.employee?.id : undefined)} placeholder="Choose employee" /></Field>
              <Field label="Assigned since"><DatePicker variant="field" value={form.data.since} max={todayISO()} onChange={(v) => setForm({ ...form, data: { ...form.data, since: v } })} /></Field>
            </>}
            <div className="sm:col-span-2"><Field label="Note"><input value={form.data.note} onChange={(e) => setForm({ ...form, data: { ...form.data, note: e.target.value } })} maxLength={200} className={inputCls} /></Field></div>
          </div>
          {kind === "email" && <p className="mt-3 text-xs text-ink-muted">Passwords are never stored here.</p>}
        </Modal>
      )}
      {freeing && (
        <Modal open onClose={() => setFreeing(null)} title={`Free ${freeing.label}?`} size="sm"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setFreeing(null)}>Cancel</SecondaryButton>
            <PrimaryButton disabled={busy} onClick={() => run(() => api.assetFree(kind, freeing.id), `${freeing.label} is free now.`, () => setFreeing(null))}>Free</PrimaryButton></div>}>
          <p className="text-sm text-ink">Free {freeing.label} from {freeing.employee?.name ?? "its holder"}? It will become Idle.</p>
        </Modal>
      )}
      {assigning && <AssignDialog asset={assigning} options={empOptions()} busy={busy} onClose={() => setAssigning(null)}
        onAssign={(emp) => run(() => api.assetAssign(kind, assigning.id, emp), `${assigning.label} assigned.`, () => setAssigning(null))} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete ${deleting.label}?`} size="sm"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setDeleting(null)}>Cancel</SecondaryButton>
            <PrimaryButton className="bg-status-danger hover:bg-status-danger/90" disabled={busy} onClick={() => run(() => api.assetDelete(kind, deleting.id), "Deleted.", () => setDeleting(null))}>Delete</PrimaryButton></div>}>
          <p className="text-sm text-ink">It&apos;s removed from the list. Its history is kept.</p>
        </Modal>
      )}
      {history && <HistoryDialog asset={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Icon({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button aria-label={label} title={label.split(" of ")[0].split(" ")[0]} onClick={onClick}
    className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted", danger ? "hover:bg-status-dangerBg hover:text-status-danger" : "hover:bg-surface hover:text-ink")}>{children}</button>;
}

function AssignDialog({ asset, options, busy, onClose, onAssign }: { asset: Asset; options: { value: string; label: string }[]; busy: boolean; onClose: () => void; onAssign: (emp: string) => void }) {
  const [emp, setEmp] = useState("");
  return (
    <Modal open onClose={onClose} title={`Assign ${asset.label}`} size="sm"
      footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton disabled={!emp || busy} onClick={() => onAssign(emp)}>Assign</PrimaryButton></div>}>
      <Field label="Employee"><Select variant="field" ariaLabel="Employee" value={emp} onChange={setEmp} options={options} placeholder={options.length ? "Choose employee" : `Everyone already has a company ${asset.kind === "sim" ? "SIM" : "email"}`} /></Field>
      <p className="mt-2 text-xs text-ink-muted">Status becomes Assigned from today. Their login email and profile mobile don&apos;t change.</p>
    </Modal>
  );
}

function HistoryDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { data, loading, error } = useApi(() => api.assetHistory(asset.kind, asset.id), [asset.id]);
  return (
    <Modal open onClose={onClose} title={`History · ${asset.label}`} size="md">
      <ErrorBanner message={error} />
      {loading && !data ? <Loading rows={3} /> : !data?.length ? <p className="text-sm text-ink-muted">Never assigned yet.</p> : (
        <table className="w-full text-left text-sm">
          <thead><tr className={tableHeadCls}><th className="py-2">Who</th><th>From</th><th>To</th><th>Changed by</th></tr></thead>
          <tbody>{data.map((h, i) => (
            <tr key={i} className="border-t border-surface-border">
              <td className="py-2">{h.employee ?? "—"}</td><td>{formatDate(h.from)}</td><td>{h.to ? formatDate(h.to) : "Now"}</td>
              <td className="text-ink-muted">{h.by ?? "—"}{h.endedBy && h.to ? ` · ended by ${h.endedBy}` : !h.by && h.to ? " · freed when set inactive" : ""}</td>
            </tr>))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
