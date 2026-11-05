"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Copy, Download, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/pickers";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { ProjectForm } from "@/components/builder/project-form";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { shortINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BUILDER_STATUSES, UNIT_TYPES, type BuilderProject } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monYear = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
const rs = (n: number | null | undefined) => (n ? `₹${shortINR(n).replace(" ", "")}` : "—");
const prices = (p: BuilderProject) => p.units.map((u) => u.boxPrice).filter((x): x is number => !!x);
const priceRange = (p: BuilderProject) => {
  const xs = prices(p);
  if (!xs.length) return "";
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return lo === hi ? rs(lo) : `${rs(lo)} – ${rs(hi)}`;
};
const typesOf = (p: BuilderProject) => UNIT_TYPES.filter((t) => p.units.some((u) => u.type === t));
const STATUS_CHIP: Record<string, string> = {
  "Ready to Move": "bg-status-successBg text-status-success",
  "Under Construction": "bg-status-warningBg text-status-warning",
  "New Launch": "bg-brand-soft text-brand",
};

/** "Copy message": the project's template, or an automatic message. */
function messageFor(p: BuilderProject) {
  if (p.message.trim()) return p.message;
  const lines = typesOf(p).map((t) => {
    const us = p.units.filter((u) => u.type === t);
    const sizes = us.map((u) => u.size).filter(Boolean) as number[];
    const box = us.map((u) => u.boxPrice).filter(Boolean) as number[];
    return `• ${t}${sizes.length ? ` · ${Math.min(...sizes)}${Math.max(...sizes) !== Math.min(...sizes) ? `–${Math.max(...sizes)}` : ""} ${us[0].sizeUnit}` : ""}${box.length ? ` · ${rs(Math.min(...box))}${Math.max(...box) !== Math.min(...box) ? ` – ${rs(Math.max(...box))}` : ""}` : ""}`;
  });
  return [`🏢 *${p.name}*`, `📍 ${[p.subLocality, p.locality, p.city].filter(Boolean).join(", ")}`, "", ...lines, "",
    `Status: ${p.status}${p.possession ? ` · Possession ${monYear(p.possession)}` : ""}${p.rera ? " · RERA approved" : ""}`, "",
    "Yes2Broker — https://yes2broker.in", "Instagram — https://www.instagram.com/yes2broker"].join("\n");
}

type Sort = "latest" | "low" | "high" | "az";
interface Filters { q: string; city: string[]; locality: string[]; type: string[]; status: string[]; category: string[]; sort: Sort }
const EMPTY: Filters = { q: "", city: [], locality: [], type: [], status: [], category: [], sort: "latest" };
const PAGE = 20;

/** Builder Data: simple cards for everyone; add / edit for "Builder Data – manage". */
export default function BuilderDataPage() {
  const toast = useToast();
  const { user, permissions } = useSession();
  const allowed = !!(permissions?.builderData || permissions?.builderManage);
  const list = useApi(() => (allowed ? api.builderList() : Promise.resolve(null)), [allowed]);
  // Filters are remembered per user on this device.
  const key = `y2b-builder-filters-${user?.id ?? ""}`;
  const [f, setF] = useState<Filters>(EMPTY);
  useEffect(() => { try { const s = JSON.parse(window.localStorage.getItem(key) ?? "null"); if (s) setF({ ...EMPTY, ...s }); } catch { /* defaults */ } }, [key]);
  useEffect(() => { try { window.localStorage.setItem(key, JSON.stringify(f)); } catch { /* this visit only */ } }, [key, f]);
  const [shown, setShown] = useState(PAGE);
  const [details, setDetails] = useState<string | null>(null);
  const [editing, setEditing] = useState<BuilderProject | null | "new">(null);
  const [deleting, setDeleting] = useState<BuilderProject | null>(null);
  const set = (patch: Partial<Filters>) => { setF((x) => ({ ...x, ...patch })); setShown(PAGE); };
  const data = list.data;
  const all = useMemo(() => data?.projects ?? [], [data]);

  const match = (p: BuilderProject, skip?: keyof Filters) => {
    const q = f.q.trim().toLowerCase();
    return (skip === "city" || !f.city.length || f.city.includes(p.city))
      && (skip === "locality" || !f.locality.length || f.locality.includes(p.locality))
      && (skip === "type" || !f.type.length || p.units.some((u) => f.type.includes(u.type)))
      && (skip === "status" || !f.status.length || f.status.includes(p.status))
      && (skip === "category" || !f.category.length || f.category.includes(p.category))
      && (!q || [p.name, p.locality, p.subLocality, p.builder].some((x) => x.toLowerCase().includes(q)));
  };
  // Each list only offers what exists with the other picks (keeping what's already picked).
  const optionsFor = (k: "city" | "locality" | "status" | "category") =>
    Array.from(new Set([...all.filter((p) => match(p, k)).map((p) => p[k]), ...f[k]])).filter(Boolean).sort();
  const typeOptions = UNIT_TYPES.filter((t) => f.type.includes(t) || all.some((p) => match(p, "type") && p.units.some((u) => u.type === t)));

  const rows = useMemo(() => {
    const lo = (p: BuilderProject) => (prices(p).length ? Math.min(...prices(p)) : Infinity);
    const hi = (p: BuilderProject) => (prices(p).length ? Math.max(...prices(p)) : -Infinity);
    const sorter: Record<Sort, (a: BuilderProject, b: BuilderProject) => number> = {
      latest: (a, b) => b.createdAt.localeCompare(a.createdAt), low: (a, b) => lo(a) - lo(b), high: (a, b) => hi(b) - hi(a), az: (a, b) => a.name.localeCompare(b.name),
    };
    return all.filter((p) => match(p)).sort(sorter[f.sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, f]);
  const anyFilter = !!(f.q || f.city.length || f.locality.length || f.type.length || f.status.length || f.category.length);

  const copy = async (p: BuilderProject) => {
    try { await navigator.clipboard.writeText(messageFor(p)); toast("Copied"); } catch { toast("Couldn't copy. Allow clipboard access.", "error"); }
  };
  const remove = async () => {
    if (!deleting) return;
    try { await api.builderDelete(deleting.id); toast("Project deleted."); setDeleting(null); setDetails(null); list.reload(); } catch (err) { toast(errorMessage(err), "error"); }
  };
  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const lines = rows.flatMap((p) => (p.units.length ? p.units : [null]).map((u) => ({
      Project: p.name, Category: p.category, City: p.city, Locality: p.locality, "Sub-locality": p.subLocality, Builder: p.builder,
      Status: p.status, Possession: monYear(p.possession), RERA: p.rera ? "Yes" : "No", "Sold out": p.soldOut ? "Yes" : "No",
      "Unit type": u?.type ?? "", Size: u?.size ?? "", "Size unit": u?.sizeUnit ?? "", "Total units": u?.total ?? "", Available: u?.available ?? "",
      "Price per unit": u?.pricePerUnit ?? "", "Box price": u?.boxPrice ?? "", Floors: p.floors ?? "", Blocks: p.blocks ?? "", Amenities: p.amenities ?? "",
      "Parking per unit": p.parkingPerUnit ?? "", "Contact name": p.contactName,
      // Sensitive columns (manage only; the database only sends them then).
      "Sale deed": u?.saleDeed ?? "", Owner: p.owner ?? "", "Contact phone": p.contactPhone ?? "", "Brokerage %": p.brokeragePct ?? "", "Payout plan": p.payoutPlan ?? "", Remark: p.remark,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lines), "Builder Data");
    XLSX.writeFile(wb, `Y2B_Builder_Data_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!allowed) return <div className="pt-4"><EmptyState icon={Building2} title="Builder Data isn't turned on for you" text="Ask HR or Admin to switch on Builder Data in Permissions." /></div>;
  const open = all.find((p) => p.id === details) ?? null;
  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Builder Data" subtitle="Builder projects, units and prices."
        actions={data?.canManage && <div className="flex gap-2">
          <SecondaryButton onClick={exportExcel} disabled={!rows.length}><Download className="h-4 w-4" /> Excel</SecondaryButton>
          <PrimaryButton onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add project</PrimaryButton>
        </div>} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search project, locality, builder" aria-label="Search projects" className={cn(inputCls, "min-h-10 rounded-pill py-2 pl-9")} />
        </label>
        <MultiSelect label="City" options={optionsFor("city")} value={f.city} onChange={(v) => set({ city: v })} />
        <MultiSelect label="Locality" options={optionsFor("locality")} value={f.locality} onChange={(v) => set({ locality: v })} />
        <MultiSelect label="Type" options={typeOptions} value={f.type} onChange={(v) => set({ type: v })} />
        <MultiSelect label="Status" options={optionsFor("status").sort((a, b) => BUILDER_STATUSES.indexOf(a as never) - BUILDER_STATUSES.indexOf(b as never))} value={f.status} onChange={(v) => set({ status: v })} />
        <MultiSelect label="Category" options={optionsFor("category")} value={f.category} onChange={(v) => set({ category: v })} />
        <Select ariaLabel="Sort" value={f.sort} onChange={(v) => set({ sort: v as Sort })}
          options={[{ value: "latest", label: "Latest" }, { value: "low", label: "Price: low to high" }, { value: "high", label: "Price: high to low" }, { value: "az", label: "A–Z" }]} />
      </div>
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span>{rows.length} project{rows.length === 1 ? "" : "s"}</span>
        {anyFilter && <button onClick={() => set({ ...EMPTY, sort: f.sort })} className="font-medium text-brand hover:underline">Clear all</button>}
      </div>

      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !data ? <Loading /> : !rows.length ? (
        <EmptyState icon={Building2} title="No projects" text={all.length ? "Nothing matches these filters." : data?.canManage ? "Add the first project." : "No projects yet."} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.slice(0, shown).map((p) => (
            <Card key={p.id} className="cursor-pointer p-0 transition hover:shadow-md">
              <div role="button" tabIndex={0} onClick={() => setDetails(p.id)} onKeyDown={(e) => { if (e.key === "Enter") setDetails(p.id); }} aria-label={`Open ${p.name}`} className="space-y-2 p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold leading-snug text-ink">{p.name}</p>
                  <span className="flex shrink-0 gap-1.5">
                    {p.soldOut && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-muted">Sold out</span>}
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CHIP[p.status] ?? "bg-surface text-ink-muted")}>{p.status}</span>
                  </span>
                </div>
                <p className="text-sm text-ink-muted">{[p.locality, p.city].filter(Boolean).join(", ")}</p>
                <div className="flex flex-wrap gap-1.5">{typesOf(p).map((t) => <span key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-sm text-ink">{t}</span>)}</div>
                <p className="text-sm text-ink"><b className="font-semibold">{priceRange(p) || "Price on request"}</b>{p.possession && <span className="text-ink-muted"> · Possession {monYear(p.possession)}</span>}</p>
              </div>
              <div className="border-t border-surface-border px-4 py-2.5">
                <SecondaryButton className="min-h-9 px-3 py-1 text-sm" onClick={() => copy(p)}><Copy className="h-4 w-4" /> Copy message</SecondaryButton>
              </div>
            </Card>
          ))}
        </div>
      )}
      {rows.length > shown && <div className="flex justify-center"><SecondaryButton onClick={() => setShown((s) => s + PAGE)}>Load more ({rows.length - shown} more)</SecondaryButton></div>}

      {open && <Details p={open} manage={!!data?.canManage} onClose={() => setDetails(null)} onCopy={copy} onChanged={list.reload}
        onEdit={() => setEditing(open)} onDelete={() => setDeleting(open)} />}
      {editing && data && <ProjectForm initial={editing === "new" ? null : editing} list={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title={`Delete ${deleting.name}?`} size="sm"
          footer={<div className="flex justify-end gap-2"><SecondaryButton onClick={() => setDeleting(null)}>Cancel</SecondaryButton><PrimaryButton className="bg-status-danger hover:bg-status-danger/90" onClick={remove}>Delete</PrimaryButton></div>}>
          <p className="text-sm text-ink">The project and all its units are removed. This can&apos;t be undone.</p>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-b border-surface-border py-2.5 text-sm last:border-0"><span className="text-ink-muted">{k}</span><span className="text-right font-medium text-ink">{children}</span></div>;
}

function Details({ p, manage, onClose, onCopy, onChanged, onEdit, onDelete }: {
  p: BuilderProject; manage: boolean; onClose: () => void; onCopy: (p: BuilderProject) => void; onChanged: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [avail, setAvail] = useState<Record<string, string>>({});
  const saveAvail = async (id: string) => {
    try { await api.builderSetAvailable(id, Number(avail[id])); toast("Availability updated."); setAvail((a) => { const n = { ...a }; delete n[id]; return n; }); onChanged(); } catch (err) { toast(errorMessage(err), "error"); }
  };
  const units = [...p.units].sort((a, b) => UNIT_TYPES.indexOf(a.type as never) - UNIT_TYPES.indexOf(b.type as never) || (a.size ?? 0) - (b.size ?? 0));
  const dash = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  return (
    <Modal open onClose={onClose} panel title={p.name} subtitle={`${[p.subLocality, p.locality, p.city].filter(Boolean).join(", ")}`}
      footer={<div className="flex flex-wrap justify-between gap-2">
        <SecondaryButton onClick={() => onCopy(p)}><Copy className="h-4 w-4" /> Copy message</SecondaryButton>
        {manage && <div className="flex gap-2">
          <SecondaryButton onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</SecondaryButton>
          <SecondaryButton onClick={onDelete} className="text-status-danger"><Trash2 className="h-4 w-4" /> Delete</SecondaryButton>
        </div>}
      </div>}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", STATUS_CHIP[p.status] ?? "bg-surface")}>{p.status}</span>
          {p.soldOut && <span className="rounded-full bg-surface px-2.5 py-0.5 text-sm font-medium text-ink-muted">Sold out</span>}
          {p.rera && <span className="rounded-full bg-status-successBg px-2.5 py-0.5 text-sm font-medium text-status-success">RERA</span>}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Units</h3>
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-surface text-ink-muted"><tr><th className="px-3 py-2 font-medium">Type</th><th className="px-3 font-medium">Size</th><th className="px-3 font-medium">Available / Total</th><th className="px-3 text-right font-medium">Box price</th>{manage && <th className="px-3 text-right font-medium">Sale deed</th>}</tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} className="border-t border-surface-border">
                    <td className="px-3 py-2.5 font-medium">{u.type}</td>
                    <td className="px-3">{u.size ? `${u.size} ${u.sizeUnit}` : "—"}</td>
                    <td className="px-3">
                      {manage && u.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input aria-label={`Available ${u.type} ${u.size ?? ""}`} inputMode="numeric" value={avail[u.id] ?? String(u.available)}
                            onChange={(e) => setAvail((a) => ({ ...a, [u.id!]: e.target.value.replace(/\D/g, "") }))} className="w-14 rounded-lg border border-surface-border px-2 py-1 text-sm" />
                          / {u.total}
                          {avail[u.id] != null && avail[u.id] !== String(u.available) && <button onClick={() => saveAvail(u.id!)} className="rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-white">Save</button>}
                        </span>
                      ) : `${u.available} / ${u.total}`}
                    </td>
                    <td className="px-3 text-right">{rs(u.boxPrice)}</td>
                    {manage && <td className="px-3 text-right">{rs(u.saleDeed)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink">Project info</h3>
          <Row k="Category">{p.category}</Row>
          <Row k="Builder">{dash(p.builder)}</Row>
          <Row k="Possession">{monYear(p.possession) || "—"}</Row>
          <Row k="RERA">{p.rera ? "Yes" : "No"}</Row>
          <Row k="Floors">{dash(p.floors)}</Row>
          <Row k="Blocks">{dash(p.blocks)}</Row>
          <Row k="Amenities">{dash(p.amenities)}</Row>
          <Row k="Parking per unit">{dash(p.parkingPerUnit)}</Row>
          <Row k="Contact">{dash(p.contactName)}</Row>
        </section>

        {manage && (
          <section className="rounded-2xl bg-surface p-4">
            <h3 className="mb-1 text-sm font-semibold text-ink">Private</h3>
            <Row k="Owner">{dash(p.owner)}</Row>
            <Row k="Contact phone">{p.contactPhone ? <a href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline"><Phone className="h-3.5 w-3.5" />{p.contactPhone}</a> : "—"}</Row>
            <Row k="Brokerage">{p.brokeragePct != null ? `${p.brokeragePct}%` : "—"}</Row>
            <Row k="Payout plan">{dash(p.payoutPlan)}</Row>
            <Row k="Remark">{dash(p.remark)}</Row>
          </section>
        )}
      </div>
    </Modal>
  );
}
