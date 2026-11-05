"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton, Toggle } from "@/components/ui/button";
import { DatePicker, Select } from "@/components/ui/pickers";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { inrWords, shortINR, toAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BUILDER_STATUSES, UNIT_TYPES, type BuilderList, type BuilderProject } from "@/types";

interface Row { key: string; id?: string; type: string; size: string; sizeUnit: "sq.ft" | "sq.yrd"; total: string; available: string; pricePerUnit: string; boxPrice: string; saleDeed: string }
const str = (v: unknown) => (v == null ? "" : String(v));
let seq = 0;
const newRow = (type: string, from?: Partial<Row>): Row => ({ key: `r${++seq}`, type, size: "", sizeUnit: type === "Plot" || type === "Bungalow" ? "sq.yrd" : "sq.ft", total: "", available: "", pricePerUnit: "", boxPrice: "", saleDeed: "", ...from });
const STEPS = ["Project", "Inventory", "Details", "Preview"];

/** Add / edit a builder project in 4 steps (manage permission only). */
export function ProjectForm({ initial, list, onClose, onSaved }: { initial: BuilderProject | null; list: BuilderList; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [p, setP] = useState(() => ({
    name: initial?.name ?? "", category: initial?.category ?? "Residential", city: initial?.city ?? "Ahmedabad",
    locality: initial?.locality ?? "", subLocality: initial?.subLocality ?? "",
    amenities: str(initial?.amenities), floors: str(initial?.floors), blocks: str(initial?.blocks), parkingPerUnit: str(initial?.parkingPerUnit),
    status: initial?.status ?? "Under Construction", possession: initial?.possession ?? "", rera: initial?.rera ?? false,
    builder: initial?.builder ?? "", owner: initial?.owner ?? "", contactName: initial?.contactName ?? "", contactPhone: initial?.contactPhone ?? "",
    brokeragePct: str(initial?.brokeragePct), payoutPlan: initial?.payoutPlan ?? "", remark: initial?.remark ?? "",
    soldOut: initial?.soldOut ?? false, message: initial?.message ?? "",
  }));
  const [rows, setRows] = useState<Row[]>(() => (initial?.units ?? []).map((u) => newRow(u.type, {
    id: u.id, size: str(u.size), sizeUnit: u.sizeUnit, total: str(u.total), available: str(u.available),
    pricePerUnit: str(u.pricePerUnit), boxPrice: str(u.boxPrice), saleDeed: str(u.saleDeed),
  })));
  const [localities, setLocalities] = useState(list.localities);
  const [newLoc, setNewLoc] = useState("");
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }));
  const types = useMemo(() => UNIT_TYPES.filter((t) => rows.some((r) => r.type === t)), [rows]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleType = (t: string) => setRows((rs) => (rs.some((r) => r.type === t) ? rs.filter((r) => r.type !== t) : [...rs, newRow(t)]));
  // "Apply same pricing": the first size's price fields to every size of that type.
  const samePricing = (t: string) => setRows((rs) => {
    const f = rs.find((r) => r.type === t);
    return f ? rs.map((r) => (r.type === t ? { ...r, pricePerUnit: f.pricePerUnit, boxPrice: f.boxPrice, saleDeed: f.saleDeed } : r)) : rs;
  });

  const problem = (s: number): string => {
    if (s === 0) return !p.name.trim() ? "Enter the project name." : !p.locality.trim() ? "Choose the locality." : "";
    if (s === 1) {
      if (!rows.length) return "Pick at least one unit type.";
      const bad = rows.find((r) => Number(r.available || 0) > Number(r.total || 0));
      if (bad) return `${bad.type}: available units can't be more than total units.`;
    }
    if (s === 2 && p.brokeragePct && (Number(p.brokeragePct) < 0 || Number(p.brokeragePct) > 100)) return "Brokerage % must be 0–100.";
    return "";
  };
  const next = () => { const e = problem(step); if (e) toast(e, "error"); else setStep((x) => x + 1); };
  const addLocality = async () => {
    if (!newLoc.trim()) return;
    try {
      await api.localityAdd(p.city, newLoc);
      const name = newLoc.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      setLocalities((l) => [...l, { city: p.city, name }]); set({ locality: name }); setNewLoc("");
    } catch (err) { toast(errorMessage(err), "error"); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.builderSave(initial?.id ?? null, { ...p, units: rows.map(({ key: _k, ...r }) => r) });
      toast(initial ? "Project updated." : "Project added.");
      onSaved();
    } catch (err) { toast(errorMessage(err), "error"); } finally { setBusy(false); }
  };

  const money = (label: string, v: string, on: (s: string) => void) => (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-muted">{label}</span>
      <input inputMode="numeric" value={v} onChange={(e) => on(e.target.value.replace(/[^\d.]/g, ""))} className={cn(inputCls, "min-h-10 py-2")} />
      {toAmount(v) && <span className="mt-0.5 block text-[11px] leading-tight text-ink-faint">₹{shortINR(toAmount(v))} · {inrWords(toAmount(v))}</span>}
    </label>
  );
  const num = (label: string, k: keyof typeof p) => (
    <Field label={label}><input inputMode="decimal" value={String(p[k])} onChange={(e) => set({ [k]: e.target.value.replace(/[^\d.]/g, "") } as Partial<typeof p>)} className={inputCls} /></Field>
  );
  const pills = <T extends string>(value: T, options: readonly T[], on: (v: T) => void, label: string) => (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => on(o)}
        className={cn("min-h-10 rounded-pill border px-3.5 text-sm", value === o ? "border-brand bg-brand-soft font-medium text-brand" : "border-surface-border text-ink hover:bg-surface")}>{o}</button>)}
    </div>
  );

  return (
    <Modal open onClose={onClose} title={initial ? "Edit project" : "Add project"} subtitle={`Step ${step + 1} of 4 · ${STEPS[step]}`} wide
      footer={<div className="flex justify-between gap-2">
        <SecondaryButton onClick={() => (step ? setStep(step - 1) : onClose())}>{step ? "Back" : "Cancel"}</SecondaryButton>
        {step < 3 ? <PrimaryButton onClick={next}>Next</PrimaryButton> : <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save project"}</PrimaryButton>}
      </div>}>
      <ol className="mb-4 flex gap-1.5" aria-label="Steps">{STEPS.map((s, i) => <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand" : "bg-surface-border")} title={s} />)}</ol>

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Project name"><input value={p.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Field></div>
          <Field label="Category">{pills(p.category, ["Residential", "Commercial"] as const, (v) => set({ category: v }), "Category")}</Field>
          <Field label="City">{pills(p.city as "Ahmedabad" | "Gandhinagar", ["Ahmedabad", "Gandhinagar"] as const, (v) => set({ city: v, locality: "" }), "City")}</Field>
          <Field label="Locality">
            <Select variant="field" ariaLabel="Locality" value={p.locality} onChange={(v) => set({ locality: v })} placeholder="Choose locality"
              options={localities.filter((l) => l.city === p.city).map((l) => ({ value: l.name, label: l.name }))} />
          </Field>
          <Field label="Sub-locality / landmark"><input value={p.subLocality} onChange={(e) => set({ subLocality: e.target.value })} className={inputCls} /></Field>
          {list.canAddLocality && (
            <div className="flex items-end gap-2 sm:col-span-2">
              <Field label={`New locality in ${p.city}`}><input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} className={inputCls} placeholder="Not in the list? Add it" /></Field>
              <SecondaryButton onClick={addLocality} disabled={!newLoc.trim()}><Plus className="h-4 w-4" /> Add</SecondaryButton>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Unit types">
            {UNIT_TYPES.map((t) => <button key={t} type="button" aria-pressed={types.includes(t)} onClick={() => toggleType(t)}
              className={cn("min-h-10 rounded-pill border px-3.5 text-sm", types.includes(t) ? "border-brand bg-brand-soft font-medium text-brand" : "border-surface-border text-ink hover:bg-surface")}>{t}</button>)}
          </div>
          {types.map((t) => (
            <div key={t} className="rounded-2xl border border-surface-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{t}</p>
                <div className="flex gap-1.5">
                  {rows.filter((r) => r.type === t).length > 1 && <SecondaryButton className="min-h-9 px-3 py-1 text-xs" onClick={() => samePricing(t)}>Apply same pricing</SecondaryButton>}
                  <SecondaryButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setRows((rs) => [...rs, newRow(t)])}><Plus className="h-3.5 w-3.5" /> Add size</SecondaryButton>
                </div>
              </div>
              {rows.filter((r) => r.type === t).map((r) => (
                <div key={r.key} className="mb-3 grid grid-cols-2 gap-2 border-b border-surface-border pb-3 last:mb-0 last:border-0 last:pb-0 sm:grid-cols-4">
                  <label className="block"><span className="mb-1 block text-[11px] text-ink-muted">Size</span>
                    <div className="flex gap-1"><input aria-label={`${t} size`} inputMode="decimal" value={r.size} onChange={(e) => setRow(r.key, { size: e.target.value.replace(/[^\d.]/g, "") })} className={cn(inputCls, "min-h-10 py-2")} />
                      <select aria-label={`${t} size unit`} value={r.sizeUnit} onChange={(e) => setRow(r.key, { sizeUnit: e.target.value as Row["sizeUnit"] })} className="rounded-xl border border-surface-border bg-white px-1.5 text-xs"><option>sq.ft</option><option>sq.yrd</option></select></div>
                  </label>
                  <label className="block"><span className="mb-1 block text-[11px] text-ink-muted">Total units</span><input aria-label={`${t} total units`} inputMode="numeric" value={r.total} onChange={(e) => setRow(r.key, { total: e.target.value.replace(/\D/g, "") })} className={cn(inputCls, "min-h-10 py-2")} /></label>
                  <label className="block"><span className="mb-1 block text-[11px] text-ink-muted">Available</span><input aria-label={`${t} available units`} inputMode="numeric" value={r.available} onChange={(e) => setRow(r.key, { available: e.target.value.replace(/\D/g, "") })}
                    className={cn(inputCls, "min-h-10 py-2", Number(r.available || 0) > Number(r.total || 0) && "border-status-danger")} /></label>
                  <div className="flex items-end justify-end"><button type="button" aria-label={`Remove this ${t} size`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-4 w-4" /></button></div>
                  {money("Price per unit (₹)", r.pricePerUnit, (v) => setRow(r.key, { pricePerUnit: v }))}
                  {money("Box price (₹)", r.boxPrice, (v) => setRow(r.key, { boxPrice: v }))}
                  <div className="col-span-2">{money("Sale deed amount (₹)", r.saleDeed, (v) => setRow(r.key, { saleDeed: v }))}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {num("Amenities", "amenities")}{num("Floors", "floors")}{num("Blocks", "blocks")}{num("Parking per unit", "parkingPerUnit")}
          <div className="sm:col-span-2"><Field label="Status">{pills(p.status as (typeof BUILDER_STATUSES)[number], BUILDER_STATUSES, (v) => set({ status: v }), "Status")}</Field></div>
          <Field label="Possession"><DatePicker variant="field" ariaLabel="Possession" value={p.possession} onChange={(v) => set({ possession: v })} min="2000-01-01" max="2100-12-31" /></Field>
          <div className="flex items-center justify-between gap-3 pt-6"><span className="text-sm text-ink">RERA registered</span><Toggle checked={p.rera} onChange={(v) => set({ rera: v })} label="RERA" /></div>
          <Field label="Builder / firm"><input value={p.builder} onChange={(e) => set({ builder: e.target.value })} className={inputCls} /></Field>
          <Field label="Owner name"><input value={p.owner} onChange={(e) => set({ owner: e.target.value })} className={inputCls} /></Field>
          <Field label="Contact name"><input value={p.contactName} onChange={(e) => set({ contactName: e.target.value })} className={inputCls} /></Field>
          <Field label="Contact phone"><input inputMode="tel" autoComplete="off" value={p.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} className={inputCls} /></Field>
          {num("Brokerage %", "brokeragePct")}
          <Field label="Payout plan"><input value={p.payoutPlan} onChange={(e) => set({ payoutPlan: e.target.value })} className={inputCls} /></Field>
          <div className="sm:col-span-2"><Field label="Remark"><input value={p.remark} onChange={(e) => set({ remark: e.target.value })} className={inputCls} /></Field></div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2"><span className="text-sm text-ink">Sold out</span><Toggle checked={p.soldOut} onChange={(v) => set({ soldOut: v })} label="Sold out" /></div>
          <div className="sm:col-span-2"><Field label="Message template (copied by 'Copy message')">
            <textarea rows={5} value={p.message} onChange={(e) => set({ message: e.target.value })} className={cn(inputCls, "min-h-28")} placeholder="Leave empty to use an automatic message" />
          </Field></div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-sm">
          <p className="text-lg font-semibold text-ink">{p.name} {p.soldOut && <span className="ml-1 rounded-full bg-status-dangerBg px-2 py-0.5 text-xs text-status-danger">Sold out</span>}</p>
          <p className="text-ink-muted">{p.category} · {p.city} · {p.locality}{p.subLocality ? ` → ${p.subLocality}` : ""} · {p.status}{p.possession ? ` · Possession ${p.possession.slice(0, 7)}` : ""}{p.rera ? " · RERA" : ""}</p>
          <table className="w-full text-left text-xs">
            <thead><tr className="text-ink-faint"><th className="py-1">Type</th><th>Size</th><th>Avail / Total</th><th>Box price</th><th>Sale deed</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-surface-border"><td className="py-1.5">{r.type}</td><td>{r.size} {r.sizeUnit}</td><td>{r.available || 0} / {r.total || 0}</td><td>{shortINR(toAmount(r.boxPrice)) || "—"}</td><td>{shortINR(toAmount(r.saleDeed)) || "—"}</td></tr>)}</tbody>
          </table>
          <p className="text-ink-muted">Builder: {p.builder || "—"} · Owner: {p.owner || "—"} · Contact: {p.contactName || "—"} {p.contactPhone} · Brokerage: {p.brokeragePct ? `${p.brokeragePct}%` : "—"} · Payout: {p.payoutPlan || "—"}</p>
        </div>
      )}
    </Modal>
  );
}
