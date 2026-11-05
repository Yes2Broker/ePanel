"use client";

import { useMemo, useState } from "react";
import { Building2, Copy, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, PageHeader, tableHeadCls } from "@/components/ui/page";
import { DatePicker, Select } from "@/components/ui/pickers";
import { Modal, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { ProjectForm } from "@/components/builder/project-form";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { shortINR, toAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BUILDER_STATUSES, UNIT_TYPES, type BuilderProject } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monYear = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
const prices = (p: BuilderProject) => p.units.map((u) => u.boxPrice).filter((x): x is number => !!x);
const range = (xs: number[]) => (!xs.length ? "" : Math.min(...xs) === Math.max(...xs) ? `₹${shortINR(xs[0])}` : `₹${shortINR(Math.min(...xs))} – ₹${shortINR(Math.max(...xs))}`);
const typeOrder = (t: string) => UNIT_TYPES.indexOf(t as (typeof UNIT_TYPES)[number]);

/** Units grouped by type: "3 BHK · 1800–2100 sq.ft · ₹95 L – ₹1.1 Cr". */
function unitLines(p: BuilderProject) {
  const types = Array.from(new Set(p.units.map((u) => u.type))).sort((a, b) => typeOrder(a) - typeOrder(b));
  return types.map((t) => {
    const us = p.units.filter((u) => u.type === t);
    const sizes = us.map((u) => u.size).filter((x): x is number => !!x);
    const size = sizes.length ? `${Math.min(...sizes)}${Math.max(...sizes) !== Math.min(...sizes) ? `–${Math.max(...sizes)}` : ""} ${us[0].sizeUnit}` : "";
    return { type: t, size, price: range(us.map((u) => u.boxPrice).filter((x): x is number => !!x)), available: us.reduce((s, u) => s + (u.available || 0), 0) };
  });
}

/** "Copy message": the project's template, or an automatic message. */
function messageFor(p: BuilderProject) {
  if (p.message.trim()) return p.message;
  return [
    `🏢 *${p.name}*`,
    `📍 ${[p.subLocality, p.locality, p.city].filter(Boolean).join(", ")}`,
    "",
    ...unitLines(p).map((l) => `• ${l.type}${l.size ? ` · ${l.size}` : ""}${l.price ? ` · ${l.price}` : ""}`),
    "",
    `Status: ${p.status}${p.possession ? ` · Possession ${monYear(p.possession)}` : ""}${p.rera ? " · RERA approved" : ""}`,
    "",
    "Yes2Broker — https://yes2broker.in",
    "Instagram — https://www.instagram.com/yes2broker",
  ].join("\n");
}

type Sort = "latest" | "low" | "high" | "possession" | "az";

/** Builder Data: projects, units and prices (view), plus add / edit for "Builder Data – manage". */
export default function BuilderDataPage() {
  const toast = useToast();
  const { permissions } = useSession();
  const allowed = !!(permissions?.builderData || permissions?.builderManage);
  const list = useApi(() => (allowed ? api.builderList() : Promise.resolve(null)), [allowed]);
  const [f, setF] = useState({ q: "", city: "", locality: "", type: "", status: "", category: "", min: "", max: "", before: "" });
  const [sort, setSort] = useState<Sort>("latest");
  const [shown, setShown] = useState(12);
  const [details, setDetails] = useState<BuilderProject | null>(null);
  const [editing, setEditing] = useState<BuilderProject | null | "new">(null);
  const [deleting, setDeleting] = useState<BuilderProject | null>(null);
  const set = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setShown(12); };
  const data = list.data;
  const all = data?.projects ?? [];

  // Linked filters: each list only offers what's left after the filters before it.
  const inCity = all.filter((p) => !f.city || p.city === f.city);
  const inLoc = inCity.filter((p) => !f.locality || p.locality === f.locality);
  const inType = inLoc.filter((p) => !f.type || p.units.some((u) => u.type === f.type));
  const opts = (xs: string[], all: string) => [{ value: "", label: all }, ...Array.from(new Set(xs.filter(Boolean))).sort().map((x) => ({ value: x, label: x }))];

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase(), min = toAmount(f.min), max = toAmount(f.max);
    const out = inType.filter((p) => (!f.status || p.status === f.status) && (!f.category || p.category === f.category)
      && (!q || [p.name, p.locality, p.subLocality, p.builder].some((x) => x.toLowerCase().includes(q)))
      && (!f.before || (p.possession && p.possession <= f.before))
      && (!min && !max || p.units.some((u) => u.boxPrice && (!min || u.boxPrice >= min) && (!max || u.boxPrice <= max))));
    const lo = (p: BuilderProject) => Math.min(...(prices(p).length ? prices(p) : [Infinity]));
    const hi = (p: BuilderProject) => Math.max(...(prices(p).length ? prices(p) : [-Infinity]));
    const sorters: Record<Sort, (a: BuilderProject, b: BuilderProject) => number> = {
      latest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      low: (a, b) => lo(a) - lo(b),
      high: (a, b) => hi(b) - hi(a),
      possession: (a, b) => (a.possession ?? "9999").localeCompare(b.possession ?? "9999"),
      az: (a, b) => a.name.localeCompare(b.name),
    };
    return [...out].sort(sorters[sort]);
  }, [inType, f, sort]);

  const copy = async (p: BuilderProject) => {
    try { await navigator.clipboard.writeText(messageFor(p)); toast("Copied"); } catch { toast("Couldn't copy. Allow clipboard access.", "error"); }
  };
  const remove = async () => {
    if (!deleting) return;
    try { await api.builderDelete(deleting.id); toast("Project deleted."); setDeleting(null); setDetails(null); list.reload(); } catch (err) { toast(errorMessage(err), "error"); }
  };
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const manage = !!data?.canManage;
    const lines = rows.flatMap((p) => (p.units.length ? p.units : [null]).map((u) => ({
      Project: p.name, Category: p.category, City: p.city, Locality: p.locality, "Sub-locality": p.subLocality, Builder: p.builder,
      Status: p.status, Possession: monYear(p.possession), RERA: p.rera ? "Yes" : "No", "Sold out": p.soldOut ? "Yes" : "No",
      "Unit type": u?.type ?? "", Size: u?.size ?? "", "Size unit": u?.sizeUnit ?? "", "Total units": u?.total ?? "", Available: u?.available ?? "",
      "Price per unit": u?.pricePerUnit ?? "", "Box price": u?.boxPrice ?? "",
      Amenities: p.amenities ?? "", Floors: p.floors ?? "", Blocks: p.blocks ?? "", "Parking per unit": p.parkingPerUnit ?? "", "Contact name": p.contactName, Remark: p.remark,
      // Sensitive columns: only for "Builder Data – manage" (the database sends them only then anyway).
      ...(manage ? { "Sale deed": u?.saleDeed ?? "", Owner: p.owner ?? "", "Contact phone": p.contactPhone ?? "", "Brokerage %": p.brokeragePct ?? "", "Payout plan": p.payoutPlan ?? "" } : {}),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lines), "Builder Data");
    XLSX.writeFile(wb, `Y2B_Builder_Data_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!allowed) return <div className="pt-4"><EmptyState icon={Building2} title="Builder Data isn't turned on for you" text="Ask HR or Admin to switch on Builder Data in Permissions." /></div>;
  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Builder Data" subtitle="Builder projects, units, prices and possession."
        actions={<div className="flex gap-2">
          {data?.canManage && <SecondaryButton onClick={exportExcel} disabled={!rows.length}><Download className="h-4 w-4" /> Excel</SecondaryButton>}
          {data?.canManage && <PrimaryButton onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add project</PrimaryButton>}
        </div>} />
      <Card className="space-y-2.5 p-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search project, locality or builder" aria-label="Search projects" className={cn(inputCls, "pl-9")} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Select ariaLabel="City" value={f.city} onChange={(v) => set({ city: v, locality: "", type: "", status: "" })} options={opts(all.map((p) => p.city), "All cities")} />
          <Select ariaLabel="Locality" value={f.locality} onChange={(v) => set({ locality: v, type: "", status: "" })} options={opts(inCity.map((p) => p.locality), "All localities")} />
          <Select ariaLabel="Unit type" value={f.type} onChange={(v) => set({ type: v, status: "" })} options={[{ value: "", label: "All types" }, ...UNIT_TYPES.filter((t) => inLoc.some((p) => p.units.some((u) => u.type === t))).map((t) => ({ value: t, label: t }))]} />
          <Select ariaLabel="Status" value={f.status} onChange={(v) => set({ status: v })} options={[{ value: "", label: "All statuses" }, ...BUILDER_STATUSES.filter((s) => inType.some((p) => p.status === s)).map((s) => ({ value: s, label: s }))]} />
          <Select ariaLabel="Category" value={f.category} onChange={(v) => set({ category: v })} options={[{ value: "", label: "All categories" }, { value: "Residential", label: "Residential" }, { value: "Commercial", label: "Commercial" }]} />
          <input value={f.min} onChange={(e) => set({ min: e.target.value })} inputMode="numeric" placeholder="Min budget ₹" aria-label="Minimum budget" className="min-h-10 w-32 rounded-pill border border-surface-border bg-white px-3.5 text-base sm:text-sm" />
          <input value={f.max} onChange={(e) => set({ max: e.target.value })} inputMode="numeric" placeholder="Max budget ₹" aria-label="Maximum budget" className="min-h-10 w-32 rounded-pill border border-surface-border bg-white px-3.5 text-base sm:text-sm" />
          <DatePicker ariaLabel="Possession before" value={f.before} onChange={(v) => set({ before: v })} placeholder="Possession before" min="2000-01-01" max="2100-12-31" />
          <Select ariaLabel="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: "latest", label: "Latest" }, { value: "low", label: "Price: low to high" }, { value: "high", label: "Price: high to low" }, { value: "possession", label: "Nearest possession" }, { value: "az", label: "A–Z" }]} />
          {Object.values(f).some(Boolean) && <SecondaryButton onClick={() => set({ q: "", city: "", locality: "", type: "", status: "", category: "", min: "", max: "", before: "" })}>Clear</SecondaryButton>}
        </div>
        <p className="text-xs text-ink-faint">{rows.length} project{rows.length === 1 ? "" : "s"}</p>
      </Card>

      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !data ? <Loading /> : !rows.length ? (
        <EmptyState icon={Building2} title="No projects" text={all.length ? "Nothing matches these filters." : data?.canManage ? "Add the first project." : "No projects yet."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.slice(0, shown).map((p) => (
            <Card key={p.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button onClick={() => setDetails(p)} className="text-left text-base font-semibold text-ink hover:underline">{p.name}</button>
                  <p className="truncate text-xs text-ink-muted">{p.builder || "—"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.rera && <span className="rounded-full bg-status-successBg px-2 py-0.5 text-[11px] font-medium text-status-success">RERA</span>}
                  {p.soldOut && <span className="rounded-full bg-status-dangerBg px-2 py-0.5 text-[11px] font-medium text-status-danger">Sold out</span>}
                </div>
              </div>
              <p className="text-sm text-ink">{p.locality}{p.subLocality ? ` → ${p.subLocality}` : ""}<span className="text-ink-faint"> · {p.city}</span></p>
              <ul className="space-y-0.5 text-sm">
                {unitLines(p).map((l) => <li key={l.type} className="flex justify-between gap-2"><span><b className="font-medium">{l.type}</b>{l.size && <span className="text-ink-muted"> · {l.size}</span>}</span><span className="text-ink">{l.price}</span></li>)}
              </ul>
              <p className="text-xs text-ink-muted">{p.units.reduce((s, u) => s + (u.available || 0), 0)} available · {p.status} · Possession {monYear(p.possession)}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <SecondaryButton className="min-h-9 px-3 py-1 text-xs" onClick={() => setDetails(p)}>Details</SecondaryButton>
                <SecondaryButton className="min-h-9 px-3 py-1 text-xs" onClick={() => copy(p)}><Copy className="h-3.5 w-3.5" /> Copy message</SecondaryButton>
                {data?.canManage && <>
                  <button aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)} className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"><Pencil className="h-4 w-4" /></button>
                  <button aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-4 w-4" /></button>
                </>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {rows.length > shown && <div className="flex justify-center"><SecondaryButton onClick={() => setShown((s) => s + 12)}>Load more ({rows.length - shown} more)</SecondaryButton></div>}

      {details && <DetailsSheet p={all.find((x) => x.id === details.id) ?? details} manage={!!data?.canManage} onClose={() => setDetails(null)} onCopy={copy} onChanged={list.reload} />}
      {editing && data && <ProjectForm initial={editing === "new" ? null : editing} list={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setDetails(null); list.reload(); }} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete ${deleting.name}?`} size="sm"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setDeleting(null)}>Cancel</SecondaryButton><PrimaryButton className="bg-status-danger hover:bg-status-danger/90" onClick={remove}>Delete</PrimaryButton></div>}>
          <p className="text-sm text-ink">The project and all its units are removed. This can&apos;t be undone.</p>
        </Modal>
      )}
    </div>
  );
}

function DetailsSheet({ p, manage, onClose, onCopy, onChanged }: { p: BuilderProject; manage: boolean; onClose: () => void; onCopy: (p: BuilderProject) => void; onChanged: () => void }) {
  const toast = useToast();
  const [avail, setAvail] = useState<Record<string, string>>({});
  const saveAvail = async (id: string) => {
    try { await api.builderSetAvailable(id, Number(avail[id])); toast("Availability updated."); setAvail((a) => { const { [id]: _drop, ...rest } = a; return rest; }); onChanged(); } catch (err) { toast(errorMessage(err), "error"); }
  };
  const info: [string, string][] = [
    ["Category", p.category], ["Location", `${p.locality}${p.subLocality ? ` → ${p.subLocality}` : ""}, ${p.city}`], ["Status", p.status], ["Possession", monYear(p.possession)],
    ["RERA", p.rera ? "Yes" : "No"], ["Builder", p.builder || "—"], ["Amenities", String(p.amenities ?? "—")], ["Floors", String(p.floors ?? "—")],
    ["Blocks", String(p.blocks ?? "—")], ["Parking per unit", String(p.parkingPerUnit ?? "—")], ["Contact", p.contactName || "—"], ["Remark", p.remark || "—"],
    ...(manage ? [["Owner", p.owner || "—"], ["Contact phone", p.contactPhone || "—"], ["Brokerage", p.brokeragePct != null ? `${p.brokeragePct}%` : "—"], ["Payout plan", p.payoutPlan || "—"]] as [string, string][] : []),
  ];
  return (
    <Modal open onClose={onClose} title={p.name} subtitle={`${p.locality} · ${p.city}${p.soldOut ? " · Sold out" : ""}`} wide
      footer={<div className="flex justify-end"><SecondaryButton onClick={() => onCopy(p)}><Copy className="h-4 w-4" /> Copy message</SecondaryButton></div>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
        {info.map(([k, v]) => <div key={k}><p className="text-xs text-ink-faint">{k}</p><p className="break-words font-medium text-ink">{v}</p></div>)}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className={tableHeadCls}><th className="py-2 pr-2">Type</th><th className="pr-2">Size</th><th className="pr-2">Available / Total</th><th className="pr-2">Price / unit</th><th className="pr-2">Box price</th>{manage && <th className="pr-2">Sale deed</th>}</tr></thead>
          <tbody>
            {p.units.map((u) => (
              <tr key={u.id} className="border-t border-surface-border">
                <td className="py-2 pr-2 font-medium">{u.type}</td>
                <td className="pr-2">{u.size ? `${u.size} ${u.sizeUnit}` : "—"}</td>
                <td className="pr-2">
                  {manage && u.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input aria-label={`Available ${u.type} ${u.size ?? ""}`} inputMode="numeric" value={avail[u.id] ?? String(u.available)} onChange={(e) => setAvail((a) => ({ ...a, [u.id!]: e.target.value.replace(/\D/g, "") }))}
                        className="w-14 rounded-lg border border-surface-border px-2 py-1 text-sm" /> / {u.total}
                      {avail[u.id] != null && avail[u.id] !== String(u.available) && <button onClick={() => saveAvail(u.id!)} className="rounded-lg bg-ink px-2 py-1 text-xs text-white">Save</button>}
                    </span>
                  ) : `${u.available} / ${u.total}`}
                </td>
                <td className="pr-2">{u.pricePerUnit ? `₹${u.pricePerUnit.toLocaleString("en-IN")}` : "—"}</td>
                <td className="pr-2">{u.boxPrice ? `₹${shortINR(u.boxPrice)}` : "—"}</td>
                {manage && <td className="pr-2">{u.saleDeed ? `₹${shortINR(u.saleDeed)}` : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
