"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Download, Flame, History, Pencil, Phone, Plus, Undo2, X, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/page";
import { DatePicker, Select } from "@/components/ui/pickers";
import { Modal, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SuggestInput } from "@/components/employees/suggest-input";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { addDays, cn, formatDateTime, todayISO } from "@/lib/utils";
import type { HotClient, HotClientInput, HotReportBlock, HotStatus, HotTemp } from "@/types";

/** "28 Nov" */
export const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

type HotRow = HotReportBlock["active"][number];
const GROUPS = [["Hot", "🔥 HOT"], ["Warm", "🌤 WARM"]] as const;
/** Active clients of one type, soonest close-by first. */
const groupOf = (b: HotReportBlock, t: HotTemp): HotRow[] =>
  b.active.filter((c) => (c.temperature ?? "Hot") === t).sort((x, y) => x.expectedDate.localeCompare(y.expectedDate) || x.name.localeCompare(y.name));
const named = (l: { name: string; project: string }[]) => l.map((c) => (c.project ? `${c.name} (${c.project})` : c.name)).join(", ");
const hasHot = (b: HotReportBlock | null | undefined): b is HotReportBlock => !!b && (b.active.length > 0 || b.won.length > 0 || b.lost.length > 0);

/** The hot & warm block of the WhatsApp text: one client per line, no phone numbers, ever. */
export function hotText(b: HotReportBlock | null | undefined, reportDate?: string) {
  if (!hasHot(b)) return "";
  const lines: string[] = [];
  for (const [t, head] of GROUPS) {
    const group = groupOf(b, t);
    if (!group.length) continue;
    lines.push(`${head} (${group.length})`);
    group.forEach((c, i) => lines.push(`${i + 1}. ${[c.name, c.project || "-", `${dayMonth(c.expectedDate)}${reportDate && c.expectedDate < reportDate ? " (overdue)" : ""}`, c.remarks].filter(Boolean).join(" | ")}`));
  }
  if (b.won.length) lines.push(`Closed today: ${named(b.won)}`);
  if (b.lost.length) lines.push(`Lost today: ${named(b.lost)}`);
  return lines.join("\n");
}

/** The summary popup's hot & warm table (same look as the Particulars table; also in the image). */
export function HotTable({ block, reportDate }: { block: HotReportBlock | null | undefined; reportDate: string }) {
  // On screen, tap a row to see its full name / project / remarks. The saved image
  // shows everything in full (the capture copy carries data-capture; see report-summary).
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  if (!hasHot(block)) return null;
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const full = "group-data-[capture]/cap:whitespace-normal group-data-[capture]/cap:break-words";
  const groups = GROUPS.map(([t, head]) => ({ t, head, rows: groupOf(block, t) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-1.5" aria-label="Hot and warm clients summary">
      {groups.length > 0 && (
        <table className="w-full table-fixed overflow-hidden rounded-xl border border-surface-border text-sm">
          <colgroup><col className="w-7" /><col className="w-[28%]" /><col className="w-[24%]" /><col className="w-[4.25rem]" /><col /></colgroup>
          <thead>
            <tr className="bg-ink text-left text-xs text-white">
              <th className="py-2 pl-2.5 pr-1 font-medium">#</th>
              <th className="px-1.5 py-2 font-medium">Client</th>
              <th className="px-1.5 py-2 font-medium">Project</th>
              <th className="px-1.5 py-2 font-medium">Close by</th>
              <th className="px-1.5 py-2 pr-2.5 font-medium">Remarks</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.t} aria-label={`${g.head} (${g.rows.length})`}>
              <tr className={cn("border-t border-surface-border", g.t === "Hot" ? "bg-orange-100" : "bg-amber-100")}>
                <th colSpan={5} scope="colgroup" className={cn("px-2.5 py-1.5 text-left text-xs font-bold tracking-wide", g.t === "Hot" ? "text-orange-800" : "text-amber-800")}>
                  {g.head} ({g.rows.length})
                </th>
              </tr>
              {g.rows.map((c, i) => {
                const late = c.expectedDate < reportDate;
                const k = `${g.t}-${i}`, wide = open.has(k);
                return (
                  <tr key={i} onClick={() => toggle(k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}
                    tabIndex={0} aria-expanded={wide} aria-label={`${c.name}${wide ? "" : ", tap for full details"}`}
                    className="cursor-pointer border-t border-surface-border align-top hover:bg-surface focus-visible:bg-surface focus-visible:outline-none">
                    <td className="py-2 pl-2.5 pr-1 text-ink-muted">{i + 1}</td>
                    <td className={cn("px-1.5 py-2 font-semibold text-ink", wide ? "whitespace-normal break-words" : "truncate", full)} title={c.name}>{c.name}</td>
                    <td className={cn("px-1.5 py-2 text-ink-muted", wide ? "whitespace-normal break-words" : "truncate", full)} title={c.project}>{c.project || "-"}</td>
                    <td className={cn("px-1.5 py-2 leading-tight", late ? "font-semibold text-status-danger" : "text-ink")}>
                      {dayMonth(c.expectedDate)}{late && <span className="block text-[10px] font-medium uppercase">Overdue</span>}
                    </td>
                    <td className="px-1.5 py-2 pr-2.5 text-ink-muted"><span className={cn("break-words", !wide && "line-clamp-2", "group-data-[capture]/cap:line-clamp-none")} title={c.remarks}>{c.remarks || "-"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}
      {block.won.length > 0 && <p className="flex items-start gap-1 text-xs text-ink-muted"><CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden /><span><b className="font-medium text-ink">Closed today:</b> {named(block.won)}</span></p>}
      {block.lost.length > 0 && <p className="flex items-start gap-1 text-xs text-ink-muted"><XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden /><span><b className="font-medium text-ink">Lost today:</b> {named(block.lost)}</span></p>}
    </div>
  );
}

/** 🔥 Hot / 🌤 Warm chip. */
export function TempChip({ t }: { t: HotTemp }) {
  return t === "Warm"
    ? <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">🌤 Warm</span>
    : <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">🔥 Hot</span>;
}
/** Hot first, then by expected date, then name. */
const byTemp = (a: { temperature?: HotTemp; expectedDate: string; name: string }, b: typeof a) =>
  (a.temperature === "Warm" ? 1 : 0) - (b.temperature === "Warm" ? 1 : 0) || a.expectedDate.localeCompare(b.expectedDate) || a.name.localeCompare(b.name);

const STATUS_LABEL: Record<HotStatus, string> = { Active: "Active", "Closed-Won": "Won", Lost: "Lost" };
const STATUS_CLS: Record<HotStatus, string> = {
  Active: "bg-brand-soft text-brand", "Closed-Won": "bg-status-successBg text-status-success", Lost: "bg-status-neutralBg text-ink-muted",
};

// ===========================================================================
// Add / edit dialog
// ===========================================================================
type Draft = { name: string; phone: string; project: string; expectedDate: string; remarks: string; employeeId: string; temperature: HotTemp };

export function HotClientDialog({ open, client, people, onClose, onDone, title }: {
  open: boolean; client: HotClient | null; onClose: () => void;
  /** HR/Admin adding for someone: who it's for. */ people?: { id: string; name: string }[];
  /** Gets only what changed (all fields for a new client). Throw to keep the dialog open. */ onDone: (input: HotClientInput) => Promise<void> | void;
  title?: string;
}) {
  const projects = useApi(() => (open ? api.hotClientProjects() : Promise.resolve([])), [open]);
  const blank: Draft = { name: "", phone: "", project: "", expectedDate: "", remarks: "", employeeId: "", temperature: "Hot" };
  const [d, setD] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setD(client ? { name: client.name, phone: client.phone, project: client.project, expectedDate: client.expectedDate, remarks: client.remarks, employeeId: client.employeeId, temperature: client.temperature ?? "Hot" } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);
  const set = (k: keyof Draft, v: string) => setD((x) => ({ ...x, [k]: v }));
  const today = todayISO();

  const save = async () => {
    const phone = d.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (people && !client && !d.employeeId) return setError("Choose who this client belongs to.");
    if (!d.name.trim()) return setError("Enter the customer name.");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a 10-digit contact number.");
    if (!d.expectedDate) return setError("Pick the expected closure date.");
    if (d.expectedDate < today && (!client || d.expectedDate !== client.expectedDate)) return setError("Expected closure date must be today or later.");
    const match = (projects.data ?? []).find((p) => p.name.toLowerCase() === d.project.trim().toLowerCase());
    const full: HotClientInput = {
      name: d.name.trim(), phone, projectId: match?.id ?? null, project: match ? match.name : d.project.trim(),
      expectedDate: d.expectedDate, remarks: d.remarks.trim(), temperature: d.temperature,
    };
    let input: HotClientInput = full;
    if (client) {
      // Only what changed.
      input = { id: client.id };
      const was: Record<string, unknown> = { name: client.name, phone: client.phone, project: client.project, expectedDate: client.expectedDate, remarks: client.remarks, temperature: client.temperature ?? "Hot" };
      for (const k of ["name", "phone", "expectedDate", "remarks"] as const) if (full[k] !== was[k]) input[k] = full[k];
      if (full.temperature !== was.temperature) input.temperature = full.temperature;
      if (full.project !== was.project) { input.project = full.project; input.projectId = full.projectId; }
      if (Object.keys(input).length === 1) return onClose();
    } else if (people) input.employeeId = d.employeeId;
    setBusy(true);
    try { await onDone(input); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title ?? (client ? "Edit client" : "Add hot / warm client")} size="sm"
      footer={<PrimaryButton onClick={save} disabled={busy} className="w-full justify-center py-2.5">{busy ? "Saving…" : client ? "Save" : "Add client"}</PrimaryButton>}>
      <div className="space-y-3">
        {error && <p role="alert" className="rounded-xl bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>}
        <Field label="Lead type">
          <div role="radiogroup" aria-label="Lead type" className="grid grid-cols-2 gap-2">
            {(["Hot", "Warm"] as HotTemp[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={d.temperature === t} onClick={() => setD((x) => ({ ...x, temperature: t }))}
                className={cn("min-h-11 rounded-xl border text-sm font-semibold transition",
                  d.temperature === t ? (t === "Hot" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-amber-400 bg-amber-50 text-amber-700") : "border-surface-border text-ink-muted hover:bg-surface")}>
                {t === "Hot" ? "🔥 Hot" : "🌤 Warm"}
              </button>
            ))}
          </div>
        </Field>
        {people && !client && (
          <Field label="Employee">
            <Select variant="field" ariaLabel="Employee" value={d.employeeId} onChange={(v) => set("employeeId", v)} placeholder="Choose a person"
              options={people.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        )}
        <Field label="Customer name"><input aria-label="Customer name" value={d.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="e.g. Rahul Shah" /></Field>
        <Field label="Contact number"><input aria-label="Contact number" type="tel" inputMode="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="10-digit mobile" /></Field>
        <Field label="Project" optional>
          <SuggestInput label="Project" value={d.project} onChange={(v) => set("project", v)} placeholder="Search Builder Data or type any"
            suggestions={(projects.data ?? []).map((p) => ({ value: p.name, note: "" }))} empty="No match. Your text will be saved as is." />
        </Field>
        <Field label="Expected closure date">
          <DatePicker variant="field" ariaLabel="Expected closure date" value={d.expectedDate} onChange={(v) => set("expectedDate", v)} min={today} />
        </Field>
        <Field label="Remarks" optional><textarea aria-label="Remarks" rows={2} value={d.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputCls} placeholder="e.g. Site visit done, waiting for loan" /></Field>
      </div>
    </Modal>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-muted">{label}{!optional && <span className="text-status-danger"> *</span>}</p>
      {children}
    </div>
  );
}

// ===========================================================================
// Daily report form section (changes are saved together with the report)
// ===========================================================================
export type HotChanges = Record<string, HotClientInput>; // key = client id, or "new-…" for new ones

let seq = 0;
/** Applies pending changes to a client for display. */
const merged = (c: HotClient, ch?: HotClientInput): HotClient => (ch ? { ...c, ...ch, project: ch.project ?? c.project } as HotClient : c);

export function HotClientsSection({ employeeId, forSomeone, reportDate, changes, setChanges, onOverdue }: {
  employeeId: string; forSomeone: boolean; reportDate: string;
  changes: HotChanges; setChanges: (f: (c: HotChanges) => HotChanges) => void;
  /** How many active clients still have a date before the report date. */ onOverdue: (n: number) => void;
}) {
  const { data, loading, error } = useApi(() => api.hotClients(forSomeone ? employeeId : null), [employeeId, forSomeone]);
  const [editing, setEditing] = useState<{ key: string; client: HotClient | null } | null>(null);
  const active = (data ?? []).filter((c) => c.status === "Active").sort((a, b) => byTemp(merged(a, changes[a.id]), merged(b, changes[b.id])));
  const added = Object.entries(changes).filter(([k]) => k.startsWith("new-"));
  const overdue = active.filter((c) => {
    const m = merged(c, changes[c.id]);
    return m.status === "Active" && m.expectedDate < reportDate;
  }).length;
  useEffect(() => onOverdue(overdue), [overdue, onOverdue]);

  const put = (key: string, patch: HotClientInput | null) =>
    setChanges((all) => { const next = { ...all }; if (patch) next[key] = { ...(next[key] ?? {}), ...patch }; else delete next[key]; return next; });
  const setStatus = (c: HotClient, status: HotStatus) => {
    const ch = { ...(changes[c.id] ?? { id: c.id }) };
    if (status === "Active") delete ch.status; else ch.status = status;
    setChanges((all) => { const next = { ...all }; if (Object.keys(ch).length > 1) next[c.id] = ch; else delete next[c.id]; return next; });
  };
  const setTemp = (c: HotClient, t: HotTemp) => {
    const ch = { ...(changes[c.id] ?? { id: c.id }) };
    if (t === (c.temperature ?? "Hot")) delete ch.temperature; else ch.temperature = t;
    setChanges((all) => { const next = { ...all }; if (Object.keys(ch).length > 1) next[c.id] = ch; else delete next[c.id]; return next; });
  };

  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Flame className="h-4 w-4 text-orange-500" aria-hidden /> Hot &amp; warm clients</h2>
        <button type="button" onClick={() => setEditing({ key: `new-${++seq}`, client: null })}
          className="inline-flex min-h-9 items-center gap-1 rounded-pill px-2.5 text-sm font-medium text-brand hover:bg-brand-soft">
          <Plus className="h-4 w-4" /> Add client
        </button>
      </div>
      <ErrorBanner message={error} />
      {loading && !data ? <Skeleton className="h-14" /> : !active.length && !added.length ? (
        <p className="text-sm text-ink-faint">No active hot or warm clients. Add customers you expect to close soon.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {active.map((c) => {
            const ch = changes[c.id];
            const m = merged(c, ch);
            const late = m.status === "Active" && m.expectedDate < reportDate;
            return (
              <li key={c.id} className={cn("py-2.5 first:pt-0", late && "-mx-2 rounded-xl bg-status-warningBg px-2 first:pt-2.5")} data-hot={c.name}>
                <HotLine c={m} />
                {late && <p className="mt-0.5 text-xs font-medium text-status-warning">Date passed, update it</p>}
                {m.status !== "Active" ? (
                  <p className="mt-1 flex items-center gap-2 text-xs font-medium">
                    <span className={cn("inline-flex items-center gap-1", m.status === "Closed-Won" ? "text-status-success" : "text-ink-muted")}>
                      {m.status === "Closed-Won" ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Will be marked closed (won)</> : <><XCircle className="h-3.5 w-3.5" aria-hidden /> Will be marked lost</>}
                    </span>
                    <button type="button" onClick={() => setStatus(c, "Active")} className="inline-flex items-center gap-0.5 text-brand underline"><Undo2 className="h-3 w-3" /> Undo</button>
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <RowBtn onClick={() => setEditing({ key: c.id, client: m })} label={`Edit ${c.name}`}><Pencil className="h-3.5 w-3.5" /> Edit</RowBtn>
                    <RowBtn onClick={() => setStatus(c, "Closed-Won")} label={`Closed ${c.name}`} tone="ok"><Check className="h-3.5 w-3.5" /> Closed</RowBtn>
                    <RowBtn onClick={() => setStatus(c, "Lost")} label={`Lost ${c.name}`}><X className="h-3.5 w-3.5" /> Lost</RowBtn>
                    <RowBtn onClick={() => setTemp(c, m.temperature === "Warm" ? "Hot" : "Warm")} label={`Make ${c.name} ${m.temperature === "Warm" ? "hot" : "warm"}`}>{m.temperature === "Warm" ? "→ 🔥 Hot" : "→ 🌤 Warm"}</RowBtn>
                    {ch && Object.keys(ch).length > 1 && <span className="self-center text-xs text-ink-faint">Edited, saves with the report</span>}
                  </div>
                )}
              </li>
            );
          })}
          {added.map(([k, n]) => (
            <li key={k} className="py-2.5 first:pt-0" data-hot={n.name}>
              <HotLine c={{ name: n.name ?? "", project: n.project ?? "", expectedDate: n.expectedDate ?? "", remarks: n.remarks ?? "", temperature: n.temperature ?? "Hot" }} />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">New</span>
                <RowBtn onClick={() => setEditing({ key: k, client: draftClient(n) })} label={`Edit ${n.name}`}><Pencil className="h-3.5 w-3.5" /> Edit</RowBtn>
                <RowBtn onClick={() => put(k, null)} label={`Remove ${n.name}`}><X className="h-3.5 w-3.5" /> Remove</RowBtn>
              </div>
            </li>
          ))}
        </ul>
      )}
      <HotClientDialog open={!!editing} client={editing?.client ?? null} onClose={() => setEditing(null)}
        title={editing && editing.key.startsWith("new-") && !editing.client ? "Add hot / warm client" : undefined}
        onDone={(input) => {
          if (!editing) return;
          if (editing.key.startsWith("new-")) put(editing.key, { ...(changes[editing.key] ?? {}), ...input, id: undefined });
          else put(editing.key, { ...input, id: editing.key });
        }} />
    </Card>
  );
}

const draftClient = (n: HotClientInput): HotClient => ({
  id: "", employeeId: "", employeeName: "", name: n.name ?? "", phone: n.phone ?? "", projectId: n.projectId ?? null, project: n.project ?? "",
  expectedDate: n.expectedDate ?? "", remarks: n.remarks ?? "", status: "Active", temperature: n.temperature ?? "Hot", createdAt: "", updatedAt: null, closedOn: null,
});

/** Pending changes → what the report save sends. */
export const hotPayload = (changes: HotChanges): HotClientInput[] =>
  Object.entries(changes).map(([k, v]) => (k.startsWith("new-") ? { ...v, id: undefined } : { ...v, id: k }));

function HotLine({ c }: { c: { name: string; project: string; expectedDate: string; remarks: string; temperature?: HotTemp } }) {
  return (
    <p className="text-sm text-ink">
      <span className="mr-1.5"><TempChip t={c.temperature ?? "Hot"} /></span>
      <span className="font-semibold">{c.name}</span>
      {c.project && <span className="text-ink-muted"> · {c.project}</span>}
      {c.expectedDate && <span className="text-ink-muted"> · Close by {dayMonth(c.expectedDate)}</span>}
      {c.remarks && <span className="text-ink-faint"> · {c.remarks}</span>}
    </p>
  );
}

function RowBtn({ onClick, label, tone, children }: { onClick: () => void; label: string; tone?: "ok"; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={cn("inline-flex min-h-8 items-center gap-1 rounded-pill border px-2.5 text-xs font-medium",
        tone === "ok" ? "border-status-success/40 text-status-success hover:bg-status-successBg" : "border-surface-border text-ink hover:bg-surface")}>
      {children}
    </button>
  );
}

// ===========================================================================
// Daily Reports → Hot clients tab (saves right away)
// ===========================================================================
type When = "all" | "week" | "overdue" | "month";
type Show = "Active" | "Closed-Won" | "Lost" | "all";
type TypeF = "all" | HotTemp;

export function HotClientsTab({ isManager }: { isManager: boolean }) {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.hotClients(null));
  const people = useApi(() => (isManager ? api.listEmployees() : Promise.resolve([])), [isManager]);
  const [person, setPerson] = useState("");
  const [project, setProject] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [show, setShow] = useState<Show>("Active");
  const [type, setType] = useState<TypeF>("all");
  const [open, setOpen] = useState<HotClient | null>(null);
  const [editing, setEditing] = useState<HotClient | null | "new">(null);

  const today = todayISO();
  const weekEnd = addDays(today, 7 - (new Date(`${today}T00:00:00Z`).getUTCDay() || 7)); // this Sunday
  const monthEnd = (() => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1, 0); return d.toISOString().slice(0, 10); })();
  const all = data ?? [];
  const mine = all.filter((c) => !person || c.employeeId === person);
  const activeList = mine.filter((c) => c.status === "Active");
  const counts = {
    hot: activeList.filter((c) => c.temperature !== "Warm").length,
    warm: activeList.filter((c) => c.temperature === "Warm").length,
    week: activeList.filter((c) => c.expectedDate >= today && c.expectedDate <= weekEnd).length,
    overdue: activeList.filter((c) => c.expectedDate < today).length,
    won: mine.filter((c) => c.status === "Closed-Won" && c.closedOn && c.closedOn.slice(0, 7) === today.slice(0, 7)).length,
  };
  const rows = useMemo(() => mine
    .filter((c) => show === "all" || c.status === show)
    .filter((c) => type === "all" || (c.temperature ?? "Hot") === type)
    .filter((c) => !project || c.project === project)
    .filter((c) => when === "all" || (when === "week" ? c.expectedDate >= today && c.expectedDate <= weekEnd
      : when === "overdue" ? c.status === "Active" && c.expectedDate < today : c.expectedDate.slice(0, 7) === today.slice(0, 7)))
    .sort(byTemp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, person, project, when, show, type]);
  const projects = Array.from(new Set(all.map((c) => c.project).filter(Boolean))).sort();
  const peopleList = (people.data ?? []).filter((p) => p.status === "Active").map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

  const save = async (input: HotClientInput, msg: string) => {
    const saved = await api.hotClientSave(input);
    toast(msg);
    reload();
    if (open?.id === saved.id) setOpen(saved);
  };
  const switchTemp = async (c: HotClient) => {
    const t: HotTemp = c.temperature === "Warm" ? "Hot" : "Warm";
    try { await save({ id: c.id, temperature: t }, `${c.name} is now ${t === "Hot" ? "🔥 Hot" : "🌤 Warm"}.`); } catch (e) { toast(errorMessage(e), "error"); }
  };
  const mark = async (c: HotClient, status: HotStatus) => {
    try { await save({ id: c.id, status }, status === "Closed-Won" ? `${c.name} marked closed.` : status === "Lost" ? `${c.name} marked lost.` : `${c.name} is active again.`); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(rows.map((c) => ({
      ...(isManager ? { Employee: c.employeeName } : {}), Type: c.temperature ?? "Hot", Customer: c.name, Contact: c.phone, Project: c.project,
      "Expected closure": c.expectedDate, Remarks: c.remarks, Status: STATUS_LABEL[c.status], Added: c.createdAt.slice(0, 10), Closed: c.closedOn ?? "",
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, "Hot clients");
    XLSX.writeFile(wb, `Y2B_Hot_Warm_Clients_${today}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Count label="🔥 Hot" n={counts.hot} onClick={() => { setShow("Active"); setWhen("all"); setType("Hot"); }} />
        <Count label="🌤 Warm" n={counts.warm} onClick={() => { setShow("Active"); setWhen("all"); setType("Warm"); }} />
        <Count label="Closing this week" n={counts.week} onClick={() => { setShow("Active"); setWhen("week"); }} />
        <Count label="Overdue" n={counts.overdue} tone={counts.overdue ? "warn" : undefined} onClick={() => { setShow("Active"); setWhen("overdue"); }} />
        <Count label="Won this month" n={counts.won} tone="ok" onClick={() => { setShow("Closed-Won"); setWhen("all"); }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isManager && <Select ariaLabel="Person" value={person} onChange={setPerson} placeholder="Everyone"
          options={[{ value: "", label: "Everyone" }, ...peopleList.map((p) => ({ value: p.id, label: p.name }))]} />}
        <Select ariaLabel="Project" value={project} onChange={setProject} placeholder="All projects"
          options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p, label: p }))]} />
        <Select ariaLabel="When" value={when} onChange={(v) => setWhen(v as When)}
          options={[{ value: "all", label: "Any date" }, { value: "week", label: "Closing this week" }, { value: "overdue", label: "Overdue" }, { value: "month", label: "This month" }]} />
        <Select ariaLabel="Type" value={type} onChange={(v) => setType(v as TypeF)}
          options={[{ value: "all", label: "Type: All" }, { value: "Hot", label: "🔥 Hot" }, { value: "Warm", label: "🌤 Warm" }]} />
        <Select ariaLabel="Status" value={show} onChange={(v) => setShow(v as Show)}
          options={[{ value: "Active", label: "Active" }, { value: "Closed-Won", label: "Won" }, { value: "Lost", label: "Lost" }, { value: "all", label: "All statuses" }]} />
        <div className="ml-auto flex gap-2">
          <SecondaryButton onClick={exportXlsx} disabled={!rows.length}><Download className="h-4 w-4" /> Excel</SecondaryButton>
          <PrimaryButton onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add client</PrimaryButton>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !rows.length ? (
        <EmptyState icon={Flame} title="No hot or warm clients here" text={all.length ? "Try other filters." : "Add customers you expect to close soon."} />
      ) : (
        <Card className="overflow-hidden">
          <ul aria-label="Hot and warm clients" className="divide-y divide-surface-border">
            {rows.map((c) => {
              const late = c.status === "Active" && c.expectedDate < today;
              return (
                <li key={c.id} className={cn("flex items-stretch", late && "bg-status-warningBg/60")}>
                  <button onClick={() => setOpen(c)} aria-label={`Open ${c.name}`} className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 pr-2 text-left hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                        <TempChip t={c.temperature ?? "Hot"} />
                        {c.name}
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_CLS[c.status])}>{STATUS_LABEL[c.status]}</span>
                        {late && <span className="text-xs font-medium text-status-warning">Date passed, update it</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {[isManager && c.employeeName, c.project, c.remarks].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm font-semibold", late ? "text-status-warning" : "text-ink")}>{dayMonth(c.expectedDate)}</p>
                      <p className="text-[11px] text-ink-faint">{c.status === "Active" ? "close by" : c.closedOn ? `on ${dayMonth(c.closedOn)}` : ""}</p>
                    </div>
                  </button>
                  {c.status === "Active" && (
                    <button onClick={() => switchTemp(c)} aria-label={`Make ${c.name} ${c.temperature === "Warm" ? "hot" : "warm"}`} title={c.temperature === "Warm" ? "Make it Hot" : "Make it Warm"}
                      className="flex w-12 shrink-0 items-center justify-center border-l border-surface-border text-lg hover:bg-surface">
                      {c.temperature === "Warm" ? "🔥" : "🌤"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {open && <HotDetails c={open} isManager={isManager} onClose={() => setOpen(null)} onEdit={() => setEditing(open)} onMark={(s) => mark(open, s)} onSwitch={() => switchTemp(open)} />}
      <HotClientDialog open={!!editing} client={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)}
        people={isManager && editing === "new" ? peopleList : undefined}
        onDone={(input) => save(input, editing === "new" ? "Hot client added." : "Hot client updated.")} />
    </div>
  );
}

function Count({ label, n, tone, onClick }: { label: string; n: number; tone?: "warn" | "ok"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-card border border-surface-border bg-white p-3 text-left shadow-card hover:border-brand/40">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold", tone === "warn" ? "text-status-warning" : tone === "ok" ? "text-status-success" : "text-ink")}>{n}</p>
    </button>
  );
}

function HotDetails({ c, isManager, onClose, onEdit, onMark, onSwitch }: {
  c: HotClient; isManager: boolean; onClose: () => void; onEdit: () => void; onMark: (s: HotStatus) => void; onSwitch: () => void;
}) {
  const history = useApi(() => api.hotClientHistory(c.id), [c.id, c.updatedAt]);
  const late = c.status === "Active" && c.expectedDate < todayISO();
  return (
    <Modal open onClose={onClose} title={c.name} subtitle={isManager ? c.employeeName : undefined} size="sm" largeTitle
      footer={c.status === "Active" ? (
        <div className="grid grid-cols-3 gap-2">
          <SecondaryButton onClick={onEdit} className="justify-center"><Pencil className="h-4 w-4" /> Edit</SecondaryButton>
          <SecondaryButton onClick={() => onMark("Closed-Won")} className="justify-center text-status-success"><Check className="h-4 w-4" /> Closed</SecondaryButton>
          <SecondaryButton onClick={() => onMark("Lost")} className="justify-center"><X className="h-4 w-4" /> Lost</SecondaryButton>
        </div>
      ) : <SecondaryButton onClick={() => onMark("Active")} className="w-full justify-center"><Undo2 className="h-4 w-4" /> Make active again</SecondaryButton>}>
      <dl className="space-y-2 text-sm">
        <Row k="Type"><TempChip t={c.temperature ?? "Hot"} />{c.status === "Active" && <button onClick={onSwitch} className="ml-2 text-xs font-medium text-brand underline">Make it {c.temperature === "Warm" ? "Hot" : "Warm"}</button>}</Row>
        <Row k="Status"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[c.status])}>{STATUS_LABEL[c.status]}</span>{c.closedOn && <span className="ml-2 text-ink-muted">on {dayMonth(c.closedOn)}</span>}</Row>
        <Row k="Contact"><a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-brand"><Phone className="h-3.5 w-3.5" /> {c.phone}</a></Row>
        <Row k="Project">{c.project || "—"}</Row>
        <Row k="Expected closure"><span className={cn(late && "font-semibold text-status-warning")}>{dayMonth(c.expectedDate)}{late && " · date passed, update it"}</span></Row>
        <Row k="Remarks">{c.remarks || "—"}</Row>
      </dl>
      <div className="mt-4 border-t border-surface-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><History className="h-4 w-4" /> History</p>
        {history.loading && !history.data ? <Skeleton className="h-10" /> : (
          <ul className="space-y-2">
            {(history.data ?? []).map((h, i) => (
              <li key={i} className="border-l-2 border-brand pl-3 text-sm">
                <p className="text-xs text-ink-faint">{formatDateTime(h.at)} · {h.by ?? "—"}</p>
                <p className="text-ink">{h.field === "Added" ? "Added" : <>{h.field}: <span className="text-ink-muted line-through">{h.old ?? "—"}</span> → {h.new ?? "—"}</>}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex gap-3"><dt className="w-32 shrink-0 text-ink-muted">{k}</dt><dd className="min-w-0 text-ink">{children}</dd></div>;
}
