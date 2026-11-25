"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, CloudSun, Download, Flame, History, Pencil, Phone, Plus, Undo2, X, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Skeleton } from "@/components/ui/page";
import { DatePicker, Select } from "@/components/ui/pickers";
import { Modal, inputCls } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { SuggestInput } from "@/components/employees/suggest-input";
import { HelpTip, InfoTip } from "@/components/ui/help-tip";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { addDays, cn, formatDateTime, todayISO } from "@/lib/utils";
import type { HotClient, HotClientInput, HotReportBlock, HotStatus, HotTemp } from "@/types";

/** "28 Nov" */
export const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });

type HotRow = HotReportBlock["active"][number];
// The shared summary: HOT then WARM. No phone numbers (those stay in the panel).
const GROUPS = [["Hot", "HOT"], ["Warm", "WARM"]] as const;

/** Active clients of one type, soonest close-by first. */
const groupOf = (b: HotReportBlock, t: HotTemp): HotRow[] =>
  b.active.filter((c) => (c.temperature ?? "Hot") === t).sort((x, y) => x.expectedDate.localeCompare(y.expectedDate) || x.name.localeCompare(y.name));
const named = (l: { name: string; project: string }[]) => l.map((c) => (c.project ? `${c.name} (${c.project})` : c.name)).join(", ");
const hasHot = (b: HotReportBlock | null | undefined): b is HotReportBlock => !!b && (b.active.length > 0 || b.won.length > 0 || b.lost.length > 0);
/** "Resale property" (pinned project choice) and "Resale – 3BHK, Chandkheda". */
export const RESALE = "Resale property";
export const isResale = (p: string | null | undefined) => !!p && (p === RESALE || p.startsWith("Resale – "));

/** The hot & warm block of the WhatsApp text: one client per line, no phone numbers. */
export function hotText(b: HotReportBlock | null | undefined, reportDate?: string) {
  if (!hasHot(b)) return "";
  const lines: string[] = [];
  for (const [t, head] of GROUPS) {
    const group = groupOf(b, t);
    if (!group.length) continue;
    lines.push(`${head} CLIENTS (${group.length})`);
    group.forEach((c, i) => lines.push(`${i + 1}. ${[c.name, c.project || "-", `${dayMonth(c.expectedDate)}${reportDate && c.expectedDate < reportDate ? " (overdue)" : ""}`, c.remarks].filter(Boolean).join(" | ")}`));
  }
  if (b.won.length) lines.push(`Booked today: ${named(b.won)}`);
  if (b.lost.length) lines.push(`Not interested today: ${named(b.lost)}`);
  return lines.join("\n");
}

/** The summary popup's hot & warm table (same look as the Particulars table; also in the image). */
export function HotTable({ block, reportDate }: { block: HotReportBlock | null | undefined; reportDate: string }) {
  // Nothing is ever cut: names, projects and remarks wrap and the row grows taller.
  if (!hasHot(block)) return null;
  const groups = GROUPS.map(([t, head]) => ({ t, head, rows: groupOf(block, t) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-1.5" aria-label="Hot and warm clients summary">
      {groups.length > 0 && (
        <table className="w-full table-fixed overflow-hidden rounded-xl border border-surface-border text-[12.5px] [hyphens:auto]">
          {/* The popup is narrow on every screen: keep fixed columns small so Remarks always has room. */}
          <colgroup><col className="w-6" /><col className="w-[27%]" /><col className="w-[22%]" /><col className="w-[3.6rem]" /><col /></colgroup>
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
                  <span className="inline-flex items-center gap-1"><TempIcon t={g.t} className="h-3.5 w-3.5" />{g.head} ({g.rows.length})</span>
                </th>
              </tr>
              {g.rows.map((c, i) => {
                const late = c.expectedDate < reportDate;
                return (
                  <tr key={i} aria-label={c.name} className="border-t border-surface-border align-top">
                    <td className="py-2 pl-2.5 pr-1 text-ink-muted">{i + 1}</td>
                    <td className="whitespace-normal break-words px-1.5 py-2 font-semibold text-ink">{c.name}</td>
                    <td className="whitespace-normal break-words px-1.5 py-2 text-ink-muted">{c.project || "-"}</td>
                    <td className={cn("px-1.5 py-2 leading-tight", late ? "font-semibold text-status-danger" : "text-ink")}>
                      {dayMonth(c.expectedDate)}{late && <span className="block text-[10px] font-medium uppercase">Overdue</span>}
                    </td>
                    <td className="px-1.5 py-2 pr-2.5 text-ink-muted"><span className="whitespace-normal break-words">{c.remarks || "-"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}
      {block.won.length > 0 && <p className="flex items-start gap-1 text-xs text-ink-muted"><CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden /><span><b className="font-medium text-ink">Booked today:</b> {named(block.won)}</span></p>}
      {block.lost.length > 0 && <p className="flex items-start gap-1 text-xs text-ink-muted"><XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden /><span><b className="font-medium text-ink">Not interested today:</b> {named(block.lost)}</span></p>}
    </div>
  );
}

/** Hot = orange flame, Warm = amber cloud-sun (lucide icons, sized like the text). */
export function TempIcon({ t, className }: { t: HotTemp; className?: string }) {
  return t === "Warm"
    ? <CloudSun className={cn("h-[1em] w-[1em] shrink-0 text-amber-500", className)} aria-hidden />
    : <Flame className={cn("h-[1em] w-[1em] shrink-0 text-orange-500", className)} aria-hidden />;
}
/** What the words mean (tooltips: hover on desktop, long-press on phones, or the (i) button). */
export const HELP = {
  Hot: "Very likely to book soon.",
  Warm: "Interested, but needs more time.",
  Booked: "Client has booked the property. Deal done.",
  NotInterested: "Client will not buy now. Removes them from your active list.",
} as const;
/** Hot / Warm chip (with its help text). */
export function TempChip({ t }: { t: HotTemp }) {
  return (
    <HelpTip text={t === "Warm" ? HELP.Warm : HELP.Hot}>
      {t === "Warm"
        ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><TempIcon t="Warm" className="h-3 w-3" />Warm</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700"><TempIcon t="Hot" className="h-3 w-3" />Hot</span>}
    </HelpTip>
  );
}
/** Hot first, then by expected date, then name. */
const byTemp = (a: { temperature?: HotTemp; expectedDate: string; name: string }, b: typeof a) =>
  (a.temperature === "Warm" ? 1 : 0) - (b.temperature === "Warm" ? 1 : 0) || a.expectedDate.localeCompare(b.expectedDate) || a.name.localeCompare(b.name);

// Stored values stay Closed-Won / Lost; people see Booked / Not interested.
export const STATUS_LABEL: Record<HotStatus, string> = { Active: "Active", "Closed-Won": "Booked", Lost: "Not interested" };
const STATUS_CLS: Record<HotStatus, string> = {
  Active: "bg-brand-soft text-brand", "Closed-Won": "bg-status-successBg text-status-success", Lost: "bg-status-neutralBg text-ink-muted",
};

// ===========================================================================
// Add / edit dialog
// ===========================================================================
type Draft = { name: string; phone: string; project: string; resaleNote: string; expectedDate: string; remarks: string; employeeId: string; temperature: HotTemp };

export function HotClientDialog({ open, client, people, onClose, onDone, title }: {
  open: boolean; client: HotClient | null; onClose: () => void;
  /** HR/Admin adding for someone: who it's for. */ people?: { id: string; name: string }[];
  /** Gets only what changed (all fields for a new client). Throw to keep the dialog open. */ onDone: (input: HotClientInput) => Promise<void> | void;
  title?: string;
}) {
  const projects = useApi(() => (open ? api.hotClientProjects() : Promise.resolve([])), [open]);
  const blank: Draft = { name: "", phone: "", project: "", resaleNote: "", expectedDate: "", remarks: "", employeeId: "", temperature: "Hot" };
  const [d, setD] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setD(client ? { name: client.name, phone: client.phone, project: isResale(client.project) ? RESALE : client.project,
      resaleNote: client.project?.startsWith("Resale – ") ? client.project.slice("Resale – ".length) : "", expectedDate: client.expectedDate, remarks: client.remarks, employeeId: client.employeeId, temperature: client.temperature ?? "Hot" } : blank);
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
    const resale = d.project.trim() === RESALE;
    const match = resale ? undefined : (projects.data ?? []).find((p) => p.name.toLowerCase() === d.project.trim().toLowerCase());
    const projectText = resale ? (d.resaleNote.trim() ? `Resale – ${d.resaleNote.trim()}` : RESALE) : d.project.trim();
    const full: HotClientInput = {
      name: d.name.trim(), phone, projectId: match?.id ?? null, project: match ? match.name : projectText,
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
        <Field label={<span className="inline-flex items-center gap-0.5">Lead type <InfoTip label="What do Hot and Warm mean?" text={<>Hot: {HELP.Hot}<br />Warm: {HELP.Warm}</>} /></span>}>
          <div role="radiogroup" aria-label="Lead type" className="grid grid-cols-2 gap-2">
            {(["Hot", "Warm"] as HotTemp[]).map((t) => (
              <HelpTip key={t} text={HELP[t]} className="block"><button type="button" role="radio" aria-checked={d.temperature === t} onClick={() => setD((x) => ({ ...x, temperature: t }))}
                className={cn("min-h-11 rounded-xl border text-sm font-semibold transition",
                  d.temperature === t ? (t === "Hot" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-amber-400 bg-amber-50 text-amber-700") : "border-surface-border text-ink-muted hover:bg-surface")}>
                <span className="inline-flex items-center justify-center gap-1.5"><TempIcon t={t} className="h-4 w-4" />{t}</span>
              </button></HelpTip>
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
            suggestions={(projects.data ?? []).map((p) => ({ value: p.name, note: "" }))} empty="No match. Your text will be saved as is."
            pinned={[{ value: RESALE, note: "Not a builder project" }]} />
          {d.project.trim() === RESALE && (
            <input aria-label="Property / location (optional)" value={d.resaleNote} onChange={(e) => set("resaleNote", e.target.value)}
              className={cn(inputCls, "mt-2")} placeholder="Property / location (optional), e.g. 3BHK, Chandkheda" />
          )}
        </Field>
        <Field label="Expected closure date">
          <DatePicker variant="field" ariaLabel="Expected closure date" value={d.expectedDate} onChange={(v) => set("expectedDate", v)} min={today} />
        </Field>
        <Field label="Remarks" optional><textarea aria-label="Remarks" rows={2} value={d.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputCls} placeholder="e.g. Site visit done, waiting for loan" /></Field>
      </div>
    </Modal>
  );
}

function Field({ label, optional, children }: { label: React.ReactNode; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center text-xs font-medium text-ink-muted">{label}{!optional && <span className="ml-0.5 text-status-danger">*</span>}</div>
      {children}
    </div>
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
    .filter((c) => !project || (project === RESALE ? isResale(c.project) : c.project === project))
    .filter((c) => when === "all" || (when === "week" ? c.expectedDate >= today && c.expectedDate <= weekEnd
      : when === "overdue" ? c.status === "Active" && c.expectedDate < today : c.expectedDate.slice(0, 7) === today.slice(0, 7)))
    .sort(byTemp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, person, project, when, show, type]);
  const projects = Array.from(new Set(all.map((c) => c.project).filter((p) => p && !isResale(p)))).sort();
  const peopleList = (people.data ?? []).filter((p) => p.status === "Active").map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

  const save = async (input: HotClientInput, msg: string) => {
    const saved = await api.hotClientSave(input);
    toast(msg);
    reload();
    if (open?.id === saved.id) setOpen(saved);
  };
  const mark = async (c: HotClient, status: HotStatus) => {
    try { await save({ id: c.id, status }, status === "Closed-Won" ? `${c.name} marked Booked.` : status === "Lost" ? `${c.name} marked Not interested.` : `${c.name} is active again.`); }
    catch (e) { toast(errorMessage(e), "error"); }
  };
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(rows.map((c) => ({
      ...(isManager ? { Employee: c.employeeName } : {}), Type: c.temperature ?? "Hot", Customer: c.name, Contact: c.phone, Project: c.project,
      "Expected closure": c.expectedDate, Remarks: c.remarks, Status: STATUS_LABEL[c.status], Added: c.createdAt.slice(0, 10), "Booked / not interested on": c.closedOn ?? "",
    })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, "Hot clients");
    XLSX.writeFile(wb, `Y2B_Hot_Warm_Clients_${today}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Count label={<><TempIcon t="Hot" />Hot</>} n={counts.hot} onClick={() => { setShow("Active"); setWhen("all"); setType("Hot"); }} />
        <Count label={<><TempIcon t="Warm" />Warm</>} n={counts.warm} onClick={() => { setShow("Active"); setWhen("all"); setType("Warm"); }} />
        <Count label="Closing this week" n={counts.week} onClick={() => { setShow("Active"); setWhen("week"); }} />
        <Count label="Overdue" n={counts.overdue} tone={counts.overdue ? "warn" : undefined} onClick={() => { setShow("Active"); setWhen("overdue"); }} />
        <Count label="Booked this month" n={counts.won} tone="ok" onClick={() => { setShow("Closed-Won"); setWhen("all"); }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isManager && <Select ariaLabel="Person" value={person} onChange={setPerson} placeholder="Everyone"
          options={[{ value: "", label: "Everyone" }, ...peopleList.map((p) => ({ value: p.id, label: p.name }))]} />}
        <Select ariaLabel="Project" value={project} onChange={setProject} placeholder="All projects"
          options={[{ value: "", label: "All projects" }, { value: RESALE, label: RESALE }, ...projects.map((p) => ({ value: p, label: p }))]} />
        <Select ariaLabel="When" value={when} onChange={(v) => setWhen(v as When)}
          options={[{ value: "all", label: "Any date" }, { value: "week", label: "Closing this week" }, { value: "overdue", label: "Overdue" }, { value: "month", label: "This month" }]} />
        <Select ariaLabel="Type" value={type} onChange={(v) => setType(v as TypeF)}
          options={[{ value: "all", label: "Type: All" }, { value: "Hot", label: "Hot" }, { value: "Warm", label: "Warm" }]} />
        <Select ariaLabel="Status" value={show} onChange={(v) => setShow(v as Show)}
          options={[{ value: "Active", label: "Active" }, { value: "Closed-Won", label: "Booked" }, { value: "Lost", label: "Not interested" }, { value: "all", label: "All statuses" }]} />
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
                      <p className="mt-0.5 break-words text-xs text-ink-muted">
                        {[isManager && c.employeeName, c.project, c.remarks].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm font-semibold", late ? "text-status-warning" : "text-ink")}>{dayMonth(c.expectedDate)}</p>
                      <p className="text-[11px] text-ink-faint">{c.status === "Active" ? "close by" : c.closedOn ? `on ${dayMonth(c.closedOn)}` : ""}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {open && <HotDetails c={open} isManager={isManager} onClose={() => setOpen(null)} onEdit={() => setEditing(open)} onMark={(s) => mark(open, s)} />}
      <HotClientDialog open={!!editing} client={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)}
        people={isManager && editing === "new" ? peopleList : undefined}
        onDone={(input) => save(input, editing === "new" ? "Hot client added." : "Hot client updated.")} />
    </div>
  );
}

function Count({ label, n, tone, onClick }: { label: React.ReactNode; n: number; tone?: "warn" | "ok"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-card border border-surface-border bg-white p-3 text-left shadow-card hover:border-brand/40">
      <p className="flex items-center gap-1 text-xs text-ink-muted">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold", tone === "warn" ? "text-status-warning" : tone === "ok" ? "text-status-success" : "text-ink")}>{n}</p>
    </button>
  );
}

function HotDetails({ c, isManager, onClose, onEdit, onMark }: {
  c: HotClient; isManager: boolean; onClose: () => void; onEdit: () => void; onMark: (s: HotStatus) => void;
}) {
  const history = useApi(() => api.hotClientHistory(c.id), [c.id, c.updatedAt]);
  const late = c.status === "Active" && c.expectedDate < todayISO();
  const [confirm, setConfirm] = useState<HotStatus | null>(null);
  const word = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as HotStatus] : v);
  return (
    <Modal open onClose={onClose} title={c.name} subtitle={isManager ? c.employeeName : undefined} size="sm" largeTitle
      footer={c.status === "Active" ? (
        <div className="flex items-stretch gap-2">
          <SecondaryButton onClick={onEdit} className="flex-1 justify-center px-2"><Pencil className="h-4 w-4" /> Edit</SecondaryButton>
          <HelpTip text={HELP.Booked} className="flex-1"><SecondaryButton onClick={() => setConfirm("Closed-Won")} className="w-full justify-center px-2 text-status-success"><Check className="h-4 w-4" /> Booked</SecondaryButton></HelpTip>
          <HelpTip text={HELP.NotInterested} className="flex-[1.4]"><SecondaryButton onClick={() => setConfirm("Lost")} className="w-full justify-center whitespace-nowrap px-2"><X className="h-4 w-4" /> Not interested</SecondaryButton></HelpTip>
          <InfoTip label="What do Booked and Not interested mean?" text={<>Booked: {HELP.Booked}<br />Not interested: {HELP.NotInterested}</>} />
        </div>
      ) : <SecondaryButton onClick={() => onMark("Active")} className="w-full justify-center"><Undo2 className="h-4 w-4" /> Make active again</SecondaryButton>}>
      <dl className="space-y-2 text-sm">
        <Row k="Type"><TempChip t={c.temperature ?? "Hot"} /></Row>
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
                <p className="text-ink">{h.field === "Added" ? "Added" : h.field === "Status"
                  ? <>{h.field}: <span className="text-ink-muted line-through">{word(h.old) ?? "—"}</span> → {word(h.new) ?? "—"}</>
                  : <>{h.field}: <span className="text-ink-muted line-through">{h.old ?? "—"}</span> → {h.new ?? "—"}</>}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={`Mark ${c.name} as ${confirm === "Lost" ? "Not interested" : "Booked"}?`} size="sm"
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => setConfirm(null)} className="justify-center">Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { const s = confirm!; setConfirm(null); onMark(s); }} className="justify-center">
            {confirm === "Lost" ? "Not interested" : "Booked"}
          </PrimaryButton>
        </div>}>
        <p className="text-sm text-ink-muted">{confirm === "Lost" ? HELP.NotInterested : HELP.Booked}</p>
      </Modal>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex gap-3"><dt className="w-32 shrink-0 text-ink-muted">{k}</dt><dd className="min-w-0 text-ink">{children}</dd></div>;
}
