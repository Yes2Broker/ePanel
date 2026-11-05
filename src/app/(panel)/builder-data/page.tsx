"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Copy, Download, Pencil, Phone, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, PageHeader, Skeleton } from "@/components/ui/page";
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

type Sort = "latest" | "low" | "high" | "possession" | "az";
interface Filters { q: string; city: string[]; locality: string[]; type: string[]; status: string[]; category: string[]; sort: Sort }
const EMPTY: Filters = { q: "", city: [], locality: [], type: [], status: [], category: [], sort: "latest" };
// 24 fills whole rows at 1, 2, 3 and 4 columns; only the last page can be partial.
const PAGE = 24;

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
      // Ready to Move first, then the soonest possession; no date last.
      possession: (a, b) => (a.status === "Ready to Move" ? 0 : 1) - (b.status === "Ready to Move" ? 0 : 1) || (a.possession ?? "9999").localeCompare(b.possession ?? "9999"),
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

  const [sheet, setSheet] = useState(false);
  const clearAll = () => set({ ...EMPTY, sort: f.sort });
  const chips = (["city", "locality", "type", "status", "category"] as const).flatMap((k) => f[k].map((v) => ({ k, v })));
  const activeCount = chips.length;
  const filterControls = <>
    <MultiSelect label="City" options={optionsFor("city")} value={f.city} onChange={(v) => set({ city: v })} />
    <MultiSelect label="Locality" options={optionsFor("locality")} value={f.locality} onChange={(v) => set({ locality: v })} />
    <MultiSelect label="Type" options={typeOptions} value={f.type} onChange={(v) => set({ type: v })} />
    <MultiSelect label="Status" options={optionsFor("status").sort((a, b) => BUILDER_STATUSES.indexOf(a as never) - BUILDER_STATUSES.indexOf(b as never))} value={f.status} onChange={(v) => set({ status: v })} />
    <MultiSelect label="Category" options={optionsFor("category")} value={f.category} onChange={(v) => set({ category: v })} />
  </>;
  const sortControl = <Select ariaLabel="Sort" value={f.sort} onChange={(v) => set({ sort: v as Sort })}
    options={[{ value: "latest", label: "Latest" }, { value: "low", label: "Price: low to high" }, { value: "high", label: "Price: high to low" }, { value: "possession", label: "Nearest possession" }, { value: "az", label: "A–Z" }]} />;

  if (!allowed) return <div className="pt-4"><EmptyState icon={Building2} title="Builder Data isn't turned on for you" text="Ask HR or Admin to switch on Builder Data in Permissions." /></div>;
  const open = all.find((p) => p.id === details) ?? null;
  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Builder Data" subtitle="Builder projects, units and prices."
        actions={data?.canManage && <div className="flex gap-2">
          <SecondaryButton onClick={exportExcel} disabled={!rows.length}><Download className="h-4 w-4" /> Excel</SecondaryButton>
          <PrimaryButton onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add project</PrimaryButton>
        </div>} />

      {/* Sticky filter bar; on phones one "Filters (n)" button opens a sheet. */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-surface/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search project, locality, builder" aria-label="Search projects" className={cn(inputCls, "min-h-10 rounded-pill py-2 pl-9")} />
          </label>
          <div className="hidden flex-wrap items-center gap-2 sm:flex">{filterControls}</div>
          <SecondaryButton className="sm:hidden" onClick={() => setSheet(true)}><SlidersHorizontal className="h-4 w-4" /> Filters{activeCount ? ` (${activeCount})` : ""}</SecondaryButton>
          {sortControl}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>{rows.length} project{rows.length === 1 ? "" : "s"}</span>
          {chips.map((c) => (
            <button key={`${c.k}:${c.v}`} onClick={() => set({ [c.k]: (f[c.k] as string[]).filter((x) => x !== c.v) } as Partial<Filters>)} aria-label={`Remove ${c.v}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-sm text-brand hover:bg-brand-soft/70">{c.v}<X className="h-3.5 w-3.5" /></button>
          ))}
          {anyFilter && <button onClick={clearAll} className="font-medium text-brand hover:underline">Clear all</button>}
        </div>
      </div>
      {sheet && (
        <Modal open onClose={() => setSheet(false)} title="Filters" footer={<div className="flex justify-end"><PrimaryButton onClick={() => setSheet(false)}>Show {rows.length} project{rows.length === 1 ? "" : "s"}</PrimaryButton></div>}>
          <div className="flex flex-wrap gap-2">{filterControls}</div>
        </Modal>
      )}

      <ErrorBanner message={list.error} onRetry={list.reload} />
      {list.loading && !data ? (
        <div className="grid gap-3 md:grid-cols-2 min-[1400px]:grid-cols-3" aria-label="Loading projects">
          {Array.from({ length: 6 }, (_, i) => <Card key={i} className="space-y-3 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-1/4" /></Card>)}
        </div>
      ) : !rows.length ? (
        <EmptyState icon={Building2} title={all.length ? "No projects match your filters" : "No projects yet"} text={!all.length && data?.canManage ? "Add the first project." : undefined}
          action={all.length && anyFilter ? <SecondaryButton onClick={clearAll}>Clear filters</SecondaryButton> : undefined} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 min-[1400px]:grid-cols-3">
          {rows.slice(0, shown).map((p) => {
            const avail = p.units.reduce((n, u) => n + (u.available || 0), 0);
            return (
              <Card key={p.id} className={cn("flex cursor-pointer flex-col p-0 transition duration-150 hover:-translate-y-0.5 hover:shadow-md", p.soldOut && "opacity-60 grayscale")}>
                <div role="button" tabIndex={0} onClick={() => setDetails(p.id)} onKeyDown={(e) => { if (e.key === "Enter") setDetails(p.id); }} aria-label={`Open ${p.name}`} className="flex-1 space-y-2 p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold leading-snug text-ink">{p.name}</p>
                    <span className="flex shrink-0 gap-1.5">
                      {p.soldOut && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-muted">Sold out</span>}
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CHIP[p.status] ?? "bg-surface text-ink-muted")}>{p.status}</span>
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">{[p.locality, p.city].filter(Boolean).join(", ")}</p>
                  <div className="flex flex-wrap gap-1.5">{typesOf(p).map((t) => <span key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-sm text-ink">{t}</span>)}</div>
                  <p className="text-lg font-bold text-ink">{priceRange(p) || "Price on request"}</p>
                  <p className="text-sm text-ink-muted">{avail} unit{avail === 1 ? "" : "s"} available{p.possession ? ` · Possession ${monYear(p.possession)}` : ""}</p>
                </div>
                <div className="border-t border-surface-border px-4 py-2.5">
                  <SecondaryButton className="min-h-9 px-3 py-1 text-sm" onClick={() => copy(p)}><Copy className="h-4 w-4" /> Copy message</SecondaryButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {rows.length > shown && <div className="flex justify-center"><SecondaryButton onClick={() => setShown((s) => s + PAGE)}>Load more ({rows.length - shown} more)</SecondaryButton></div>}

      {open && <Details p={open} manage={!!data?.canManage} onClose={() => setDetails(null)} onCopy={copy}
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

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><p className="text-sm text-ink-muted">{k}</p><p className="text-[15px] font-medium text-ink">{v}</p></div>;
}

/** Details: a centred popup (full-screen sheet on phones). */
function Details({ p, manage, onClose, onCopy, onEdit, onDelete }: {
  p: BuilderProject; manage: boolean; onClose: () => void; onCopy: (p: BuilderProject) => void; onEdit: () => void; onDelete: () => void;
}) {
  const units = [...p.units].sort((a, b) => UNIT_TYPES.indexOf(a.type as never) - UNIT_TYPES.indexOf(b.type as never) || (a.size ?? 0) - (b.size ?? 0));
  const dash = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const perSize = (u: BuilderProject["units"][number]) => (u.pricePerUnit ? `₹${shortINR(u.pricePerUnit).replace(" ", "")} / ${u.sizeUnit}` : "");
  return (
    <Modal open onClose={onClose} wide largeTitle title={p.name} subtitle={[p.subLocality, p.locality, p.city].filter(Boolean).join(", ")}
      bodyClassName="max-sm:min-h-[85dvh]"
      footer={manage ? <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</SecondaryButton>
        <SecondaryButton onClick={onDelete} className="text-status-danger"><Trash2 className="h-4 w-4" /> Delete</SecondaryButton>
      </div> : undefined}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", STATUS_CHIP[p.status] ?? "bg-surface")}>{p.status}</span>
              {p.soldOut && <span className="rounded-full bg-surface px-2.5 py-0.5 text-sm font-medium text-ink-muted">Sold out</span>}
              {p.rera && <span className="rounded-full bg-status-successBg px-2.5 py-0.5 text-sm font-medium text-status-success">RERA</span>}
            </div>
            <p className="text-2xl font-bold text-ink">{priceRange(p) || "Price on request"}</p>
          </div>
          <PrimaryButton onClick={() => onCopy(p)}><Copy className="h-4 w-4" /> Copy message</PrimaryButton>
        </div>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink">Units</h3>
          <ul className="divide-y divide-surface-border">
            {units.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium text-ink">{u.type}{u.size ? ` · ${u.size} ${u.sizeUnit}` : ""}</span>
                  <span className="text-[15px] font-semibold text-ink">{rs(u.boxPrice)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
                  <span>{[perSize(u), `${u.available} of ${u.total} available`].filter(Boolean).join(" · ")}{manage && u.saleDeed ? ` · Sale deed ${rs(u.saleDeed)}` : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink">Project info</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Info k="Builder" v={dash(p.builder)} /><Info k="Category" v={p.category} />
            <Info k="Possession" v={monYear(p.possession) || "—"} /><Info k="RERA" v={p.rera ? "Yes" : "No"} />
            <Info k="Floors" v={dash(p.floors)} /><Info k="Blocks" v={dash(p.blocks)} />
            <Info k="Amenities" v={dash(p.amenities)} /><Info k="Parking per unit" v={dash(p.parkingPerUnit)} />
            <Info k="Contact" v={dash(p.contactName)} />
          </div>
        </section>

        {manage && (
          <section className="rounded-2xl bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Private</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Info k="Owner" v={dash(p.owner)} />
              <Info k="Contact phone" v={p.contactPhone ? <a href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-brand hover:underline"><Phone className="h-3.5 w-3.5" />{p.contactPhone}</a> : "—"} />
              <Info k="Brokerage" v={p.brokeragePct != null ? `${p.brokeragePct}%` : "—"} />
              <Info k="Payout plan" v={dash(p.payoutPlan)} />
              <div className="col-span-2"><Info k="Remark" v={dash(p.remark)} /></div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
