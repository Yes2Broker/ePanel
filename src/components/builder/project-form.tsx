"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton, Toggle } from "@/components/ui/button";
import { MonthField, Select } from "@/components/ui/pickers";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { shortINR, toAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BUILDER_STATUSES, UNIT_TYPES, type BuilderList, type BuilderProject } from "@/types";

interface Row { key: string; id?: string; type: string; size: string; sizeUnit: "sq.ft" | "sq.yrd"; total: string; available: string; pricePerUnit: string; boxPrice: string; saleDeed: string }
const str = (v: unknown) => (v == null ? "" : String(v));
let seq = 0;
const newRow = (from?: Partial<Row>): Row => ({ key: `r${++seq}`, type: "2 BHK", size: "", sizeUnit: "sq.ft", total: "", available: "", pricePerUnit: "", boxPrice: "", saleDeed: "", ...from });
const digits = (s: string) => s.replace(/[^\d.]/g, "");

/** Add / edit a builder project on one page: Project, Units, Details (manage permission only). */
export function ProjectForm({ initial, list, onClose, onSaved }: { initial: BuilderProject | null; list: BuilderList; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [p, setP] = useState(() => ({
    name: initial?.name ?? "", category: initial?.category ?? "Residential", city: initial?.city ?? "Ahmedabad",
    locality: initial?.locality ?? "", subLocality: initial?.subLocality ?? "",
    status: initial?.status ?? "Under Construction", possession: initial?.possession?.slice(0, 7) ?? "", rera: initial?.rera ?? false, soldOut: initial?.soldOut ?? false,
    floors: str(initial?.floors), blocks: str(initial?.blocks), amenities: str(initial?.amenities), parkingPerUnit: str(initial?.parkingPerUnit),
    builder: initial?.builder ?? "", owner: initial?.owner ?? "", contactName: initial?.contactName ?? "", contactPhone: initial?.contactPhone ?? "",
    brokeragePct: str(initial?.brokeragePct), payoutPlan: initial?.payoutPlan ?? "", remark: initial?.remark ?? "", message: initial?.message ?? "",
  }));
  const [rows, setRows] = useState<Row[]>(() => (initial?.units.length ? initial.units.map((u) => newRow({
    id: u.id, type: u.type, size: str(u.size), sizeUnit: u.sizeUnit, total: str(u.total), available: str(u.available),
    pricePerUnit: str(u.pricePerUnit), boxPrice: str(u.boxPrice), saleDeed: str(u.saleDeed),
  })) : [newRow()]));
  const [localities, setLocalities] = useState(list.localities);
  // Phones get stacked unit cards instead of the table.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(m.matches);
    on(); m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const [newLoc, setNewLoc] = useState("");
  const set = (patch: Partial<typeof p>) => setP((x) => ({ ...x, ...patch }));
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Inline errors (shown after the first Save).
  const err = {
    name: !p.name.trim() ? "Enter the project name." : "",
    locality: !p.locality.trim() ? "Choose the locality." : "",
    units: !rows.length ? "Add at least one unit." : "",
    brokeragePct: p.brokeragePct && Number(p.brokeragePct) > 100 ? "Must be 0–100." : "",
  };
  const rowErr = (r: Row) => (Number(r.available || 0) > Number(r.total || 0) ? "Available can't be more than total." : "");
  const ok = !Object.values(err).some(Boolean) && !rows.some(rowErr);

  const addLocality = async () => {
    if (!newLoc.trim()) return;
    try {
      await api.localityAdd(p.city, newLoc);
      const name = newLoc.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      setLocalities((l) => [...l, { city: p.city, name }]); set({ locality: name }); setNewLoc("");
    } catch (e) { toast(errorMessage(e), "error"); }
  };
  const save = async () => {
    setTried(true);
    if (!ok) { toast("Fix the highlighted fields.", "error"); return; }
    setBusy(true);
    try {
      await api.builderSave(initial?.id ?? null, { ...p, possession: p.possession ? `${p.possession}-01` : "", units: rows.map(({ key: _key, ...r }) => r) });
      toast(initial ? "Project updated." : "Project added.");
      onSaved();
    } catch (e) { toast(errorMessage(e), "error"); } finally { setBusy(false); }
  };

  const text = (label: string, k: keyof typeof p, opts: { mode?: "decimal" | "tel"; error?: string } = {}) => (
    <Field label={label}>
      <input value={String(p[k])} inputMode={opts.mode} autoComplete="off" onChange={(e) => set({ [k]: opts.mode === "decimal" ? digits(e.target.value) : e.target.value } as Partial<typeof p>)}
        className={cn(inputCls, tried && opts.error && "border-status-danger")} aria-invalid={tried && !!opts.error} />
      {tried && opts.error && <span className="mt-1 block text-sm text-status-danger">{opts.error}</span>}
    </Field>
  );
  const pills = <T extends string>(value: T, options: readonly T[], on: (v: T) => void, label: string) => (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => on(o)}
        className={cn("min-h-10 rounded-pill border px-3.5 text-sm", value === o ? "border-brand bg-brand-soft font-medium text-brand" : "border-surface-border text-ink hover:bg-surface")}>{o}</button>)}
    </div>
  );
  const cell = "min-h-10 w-full rounded-lg border border-surface-border bg-white px-2.5 py-2 text-base sm:text-sm focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand";
  const money = (r: Row, k: "pricePerUnit" | "boxPrice" | "saleDeed", label: string) => (
    <td className="px-1.5 py-2 align-top">
      <input aria-label={`${label} (${r.type})`} inputMode="numeric" value={r[k]} onChange={(e) => setRow(r.key, { [k]: digits(e.target.value) })} className={cn(cell, "min-w-[7rem]")} />
      {toAmount(r[k]) && <span className="mt-0.5 block text-sm text-ink-muted">₹{shortINR(toAmount(r[k]))}</span>}
    </td>
  );

  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add project"} wide
      footer={<div className="flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</PrimaryButton>
      </div>}>
      <div className="space-y-8">
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-ink">Project</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("Project name", "name", { error: err.name })}</div>
            <Field label="Category">{pills(p.category, ["Residential", "Commercial"] as const, (v) => set({ category: v }), "Category")}</Field>
            <Field label="City">{pills(p.city as "Ahmedabad" | "Gandhinagar", ["Ahmedabad", "Gandhinagar"] as const, (v) => set({ city: v, locality: "" }), "City")}</Field>
            <Field label="Locality">
              <Select variant="field" ariaLabel="Locality" value={p.locality} onChange={(v) => set({ locality: v })} placeholder="Choose locality" invalid={tried && !!err.locality}
                options={localities.filter((l) => l.city === p.city).map((l) => ({ value: l.name, label: l.name }))} />
              {tried && err.locality && <span className="mt-1 block text-sm text-status-danger">{err.locality}</span>}
            </Field>
            {text("Sub-locality / landmark", "subLocality")}
            {list.canAddLocality && (
              <div className="flex items-end gap-2 sm:col-span-2">
                <div className="flex-1"><Field label={`Locality not in the list? Add one in ${p.city}`}><input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} className={inputCls} /></Field></div>
                <SecondaryButton onClick={addLocality} disabled={!newLoc.trim()}><Plus className="h-4 w-4" /> Add</SecondaryButton>
              </div>
            )}
            <div className="sm:col-span-2"><Field label="Status">{pills(p.status as (typeof BUILDER_STATUSES)[number], BUILDER_STATUSES, (v) => set({ status: v }), "Status")}</Field></div>
            <Field label="Possession"><MonthField variant="field" className="block w-full" ariaLabel="Possession" value={p.possession || new Date().toISOString().slice(0, 7)} onChange={(v) => set({ possession: v })}
              label={<span className={cn("flex min-h-11 w-full items-center rounded-xl border border-surface-border bg-white px-3.5 text-base sm:text-sm", !p.possession && "text-ink-faint")}>{p.possession ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(p.possession.slice(5, 7)) - 1]} ${p.possession.slice(0, 4)}` : "Pick a month"}</span>} /></Field>
            <div className="flex items-end gap-8 pb-2">
              <label className="flex items-center gap-3 text-sm text-ink"><Toggle checked={p.rera} onChange={(v) => set({ rera: v })} label="RERA" /> RERA</label>
              <label className="flex items-center gap-3 text-sm text-ink"><Toggle checked={p.soldOut} onChange={(v) => set({ soldOut: v })} label="Sold out" /> Sold out</label>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Units</h3>
            <SecondaryButton onClick={() => setRows((rs) => [...rs, newRow({ type: rs[rs.length - 1]?.type ?? "2 BHK", sizeUnit: rs[rs.length - 1]?.sizeUnit ?? "sq.ft" })])}><Plus className="h-4 w-4" /> Add unit</SecondaryButton>
          </div>
          {tried && err.units && <p className="text-sm text-status-danger">{err.units}</p>}
          {/* Phones: each unit as a small stacked card (no sideways scrolling). */}
          {phone ? <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="space-y-2 rounded-xl border border-surface-border p-3">
                <div className="flex items-center gap-2">
                  <select aria-label="Unit type" value={r.type} onChange={(e) => setRow(r.key, { type: e.target.value, sizeUnit: ["Plot", "Bungalow"].includes(e.target.value) ? "sq.yrd" : r.sizeUnit })} className={cn(cell, "flex-1")}>
                    {UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <button type="button" aria-label={`Remove ${r.type} ${r.size}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 block text-sm text-ink-muted">Size
                    <div className="mt-1 flex gap-1"><input aria-label={`Size (${r.type})`} inputMode="decimal" value={r.size} onChange={(e) => setRow(r.key, { size: digits(e.target.value) })} className={cell} />
                      <select aria-label="Size unit" value={r.sizeUnit} onChange={(e) => setRow(r.key, { sizeUnit: e.target.value as Row["sizeUnit"] })} className={cn(cell, "w-24")}><option>sq.ft</option><option>sq.yrd</option></select></div>
                  </label>
                  <label className="block text-sm text-ink-muted">Total<input aria-label={`Total (${r.type})`} inputMode="numeric" value={r.total} onChange={(e) => setRow(r.key, { total: e.target.value.replace(/\D/g, "") })} className={cn(cell, "mt-1")} /></label>
                  <label className="block text-sm text-ink-muted">Available<input aria-label={`Available (${r.type})`} inputMode="numeric" value={r.available} onChange={(e) => setRow(r.key, { available: e.target.value.replace(/\D/g, "") })} className={cn(cell, "mt-1", rowErr(r) && "border-status-danger")} /></label>
                  {rowErr(r) && <span className="col-span-2 text-sm text-status-danger">{rowErr(r)}</span>}
                  {(["pricePerUnit", "boxPrice", "saleDeed"] as const).map((k) => (
                    <label key={k} className={cn("block text-sm text-ink-muted", k === "saleDeed" && "col-span-2")}>{{ pricePerUnit: "Price / unit ₹", boxPrice: "Box price ₹", saleDeed: "Sale deed ₹" }[k]}
                      <input aria-label={`${{ pricePerUnit: "Price per unit", boxPrice: "Box price", saleDeed: "Sale deed" }[k]} (${r.type})`} inputMode="numeric" value={r[k]} onChange={(e) => setRow(r.key, { [k]: digits(e.target.value) })} className={cn(cell, "mt-1")} />
                      {toAmount(r[k]) && <span className="mt-0.5 block text-ink-muted">₹{shortINR(toAmount(r[k]))}</span>}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div> : <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-ink-muted"><tr>
                <th className="px-2.5 py-2 font-medium">Type</th><th className="px-1.5 font-medium">Size</th><th className="px-1.5 font-medium">Total</th><th className="px-1.5 font-medium">Available</th>
                <th className="px-1.5 font-medium">Price / unit ₹</th><th className="px-1.5 font-medium">Box price ₹</th><th className="px-1.5 font-medium">Sale deed ₹</th><th />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-surface-border">
                    <td className="px-1.5 py-2 align-top">
                      <select aria-label="Unit type" value={r.type} onChange={(e) => setRow(r.key, { type: e.target.value, sizeUnit: ["Plot", "Bungalow"].includes(e.target.value) ? "sq.yrd" : r.sizeUnit })} className={cn(cell, "min-w-[6.5rem]")}>
                        {UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-1.5 py-2 align-top">
                      <div className="flex gap-1">
                        <input aria-label={`Size (${r.type})`} inputMode="decimal" value={r.size} onChange={(e) => setRow(r.key, { size: digits(e.target.value) })} className={cn(cell, "w-20")} />
                        <select aria-label="Size unit" value={r.sizeUnit} onChange={(e) => setRow(r.key, { sizeUnit: e.target.value as Row["sizeUnit"] })} className={cn(cell, "w-[5.5rem]")}><option>sq.ft</option><option>sq.yrd</option></select>
                      </div>
                    </td>
                    <td className="px-1.5 py-2 align-top"><input aria-label={`Total (${r.type})`} inputMode="numeric" value={r.total} onChange={(e) => setRow(r.key, { total: e.target.value.replace(/\D/g, "") })} className={cn(cell, "w-20")} /></td>
                    <td className="px-1.5 py-2 align-top">
                      <input aria-label={`Available (${r.type})`} inputMode="numeric" value={r.available} onChange={(e) => setRow(r.key, { available: e.target.value.replace(/\D/g, "") })} className={cn(cell, "w-20", rowErr(r) && "border-status-danger")} />
                      {rowErr(r) && <span className="mt-0.5 block max-w-[8rem] text-sm text-status-danger">{rowErr(r)}</span>}
                    </td>
                    {money(r, "pricePerUnit", "Price per unit")}{money(r, "boxPrice", "Box price")}{money(r, "saleDeed", "Sale deed")}
                    <td className="px-1.5 py-2 align-top">
                      <button type="button" aria-label={`Remove ${r.type} ${r.size}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>

        <section className="space-y-4">
          <h3 className="text-base font-semibold text-ink">Details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("Floors", "floors", { mode: "decimal" })}{text("Blocks", "blocks", { mode: "decimal" })}
            {text("Amenities", "amenities", { mode: "decimal" })}{text("Parking per unit", "parkingPerUnit", { mode: "decimal" })}
            {text("Builder / firm", "builder")}{text("Owner name", "owner")}
            {text("Contact name", "contactName")}{text("Contact phone", "contactPhone", { mode: "tel" })}
            {text("Brokerage %", "brokeragePct", { mode: "decimal", error: err.brokeragePct })}{text("Payout plan", "payoutPlan")}
            <div className="sm:col-span-2">{text("Remark", "remark")}</div>
            <div className="sm:col-span-2"><Field label="Message template (copied by “Copy message”; empty = automatic)">
              <textarea rows={5} value={p.message} onChange={(e) => set({ message: e.target.value })} className={cn(inputCls, "min-h-28")} />
            </Field></div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
