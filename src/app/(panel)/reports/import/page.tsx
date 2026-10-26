"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileUp, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/pickers";
import { CheckBox, CheckRow } from "@/components/ui/checkbox";
import { PrimaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  DateOrder, distance, hashKey, normName, parseCsv, parseSheetDate, parseSheetTime, toCount,
} from "@/lib/import-parse";
import { Employee, Project, SalesReportType } from "@/types";
import { cn, formatDate } from "@/lib/utils";

// "past" = the "Past Employee" tab: same columns as Sheet1, older daily summaries.
type Kind = "summary" | "past" | "done" | "scheduled";
type Src = "normal" | "sole";
interface Slot { src: Src; kind: Kind; label: string; columns: string }
const SLOTS: Slot[] = [
  { src: "normal", kind: "summary", label: "Normal — Sheet1", columns: "Date | Name | Leads | Calls | Positive | Scheduled | Done | Tokens" },
  { src: "normal", kind: "past", label: "Normal — Past Employee", columns: "Same columns as Sheet1" },
  { src: "normal", kind: "done", label: "Normal — Visits Done", columns: "Date | Name | Site Name | Visit Time" },
  { src: "normal", kind: "scheduled", label: "Normal — Visits Scheduled", columns: "Date | Name | Visit Name | Visit Date | Reschedule | Status | Reason" },
  { src: "sole", kind: "summary", label: "Sole Selling — Sheet1", columns: "… same as Normal … | Walk In" },
  { src: "sole", kind: "past", label: "Sole Selling — Past Employee", columns: "Same columns as Sole Selling Sheet1" },
  { src: "sole", kind: "done", label: "Sole Selling — Visits Done", columns: "Date | Name | Site Name | Visit Time | Status" },
  { src: "sole", kind: "scheduled", label: "Sole Selling — Visits Scheduled", columns: "Date | Name | Visit Name | Visit Date | Reschedule | Status | Reason" },
];
const slotId = (s: Slot) => `${s.src}-${s.kind}`;

interface Loaded { fileName: string; rows: string[][] }
/** How an old name maps: an employee id, a new inactive employee, or skip. */
type NameChoice = { mode: "employee"; employeeId: string; suggested?: boolean } | { mode: "create"; id: string } | { mode: "skip" } | { mode: "none" };

export default function ImportPage() {
  const { user } = useSession();
  const toast = useToast();
  const employees = useApi(() => api.listEmployees());
  const projects = useApi(() => api.listProjects());
  const aliases = useApi(() => api.listEmployeeAliases());
  const assignments = useApi(async () => {
    const list = await api.listEmployees();
    const pairs = await Promise.all(list.filter((e) => e.status === "Active").map(async (e) => [e.id, await api.getEmployeeProjects(e.id)] as const));
    return Object.fromEntries(pairs) as Record<string, string[]>;
  });

  const [files, setFiles] = useState<Record<string, Loaded>>({});
  const [order, setOrder] = useState<DateOrder>("DMY");
  const [names, setNames] = useState<Record<string, NameChoice>>({});
  const [projectFor, setProjectFor] = useState<Record<string, string>>({});
  const [walkInStatuses, setWalkInStatuses] = useState<Record<string, boolean>>({});
  // Site Visit Done never includes walk-ins in the panel. If the old Sole Selling
  // sheet's "Site Visit Done" did include them, they're taken out on import.
  const [soleDoneHasWalkIns, setSoleDoneHasWalkIns] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const readFile = async (slot: Slot, file: File | undefined) => {
    if (!file) return;
    const rows = parseCsv(await file.text());
    // Drop the header row (its first cell isn't a date).
    const body = rows.length && !parseSheetDate(rows[0][0] ?? "", order) ? rows.slice(1) : rows;
    setFiles((f) => ({ ...f, [slotId(slot)]: { fileName: file.name, rows: body } }));
    setResult(null);
  };

  const emps = employees.data ?? [];
  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  // ---------- names found in the files, with an automatic match ----------
  const foundNames = useMemo(() => {
    const set = new Map<string, string>();
    for (const f of Object.values(files)) for (const r of f.rows) if (r[1]?.trim()) set.set(normName(r[1]), r[1].trim());
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [files]);

  const autoMatch = (key: string): NameChoice => {
    const alias = aliases.data?.find((a) => a.alias === key);
    if (alias && empById.has(alias.employeeId)) return { mode: "employee", employeeId: alias.employeeId };
    const exact = emps.find((e) => normName(e.name) === key);
    if (exact) return { mode: "employee", employeeId: exact.id };
    let best: Employee | null = null;
    let bestD = Infinity;
    for (const e of emps) {
      const d = distance(normName(e.name), key);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best && bestD <= Math.max(3, Math.floor(key.length * 0.25))) return { mode: "employee", employeeId: best.id, suggested: true };
    return { mode: "none" };
  };
  const choiceFor = (key: string): NameChoice => names[key] ?? autoMatch(key);
  const employeeFor = (rawName: string): string | null => {
    const c = choiceFor(normName(rawName));
    return c.mode === "employee" ? c.employeeId : c.mode === "create" ? c.id.trim().toUpperCase() : null;
  };
  const unresolved = foundNames.filter(([k]) => {
    const c = choiceFor(k);
    return c.mode === "none" || (c.mode === "create" && !c.id.trim());
  });

  // ---------- sole selling: project per person, and which Status means walk-in ----------
  const soleEmployees = useMemo(() => {
    const ids = new Set<string>();
    for (const kind of ["summary", "past", "done", "scheduled"] as Kind[])
      for (const r of files[`sole-${kind}`]?.rows ?? []) { const id = r[1] ? employeeFor(r[1]) : null; if (id) ids.add(id); }
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, names, emps, aliases.data]);
  const activeProjects = (projects.data ?? []) as Project[];
  const projectOf = (empId: string) => projectFor[empId] ?? (assignments.data?.[empId]?.length === 1 ? assignments.data[empId][0] : "");
  const missingProject = soleEmployees.filter((id) => !projectOf(id));
  const soleStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const r of files["sole-done"]?.rows ?? []) if (r[4]?.trim()) s.add(r[4].trim());
    return [...s];
  }, [files]);
  const isWalkIn = (status: string) => walkInStatuses[status] ?? /walk/i.test(status);

  // ---------- build the payload + preview ----------
  const built = useMemo(() => {
    const errors: string[] = [];
    const reports = new Map<string, Record<string, unknown> & { merged: number }>();
    const doneVisits: Record<string, unknown>[] = [];
    const scheduledVisits: Record<string, unknown>[] = [];
    const occurrences = new Map<string, number>();
    const keyFor = (base: string) => { const n = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, n); return `imp-${hashKey(base)}-${n}`; };

    for (const slot of SLOTS) {
      const f = files[slotId(slot)];
      if (!f) continue;
      const type: SalesReportType = slot.src === "normal" ? "Normal" : "Sole Selling";
      f.rows.forEach((r, i) => {
        const where = `${slot.label}, row ${i + 2}`;
        const rawName = (r[1] ?? "").trim();
        if (!rawName) { errors.push(`${where}: no name`); return; }
        const choice = choiceFor(normName(rawName));
        if (choice.mode === "skip") return;
        const employeeId = employeeFor(rawName);
        if (!employeeId) return;
        const projectId = type === "Sole Selling" ? projectOf(employeeId) || null : null;
        if (type === "Sole Selling" && !projectId) return;
        const date = parseSheetDate(r[0] ?? "", order);
        if (!date) { errors.push(`${where}: can't read date "${r[0]}"`); return; }
        const rawKey = `${slot.src}|${slot.kind}|${r.map((v) => v.trim()).join("|")}`;

        if (slot.kind === "summary" || slot.kind === "past") {
          const k = `${employeeId}|${date}|${type}|${projectId}`;
          const walkIn = type === "Sole Selling" ? toCount(r[8]) : 0;
          const done = type === "Sole Selling" && soleDoneHasWalkIns ? Math.max(0, toCount(r[6]) - walkIn) : toCount(r[6]);
          const nums = { leads: toCount(r[2]), calls: toCount(r[3]), positive: toCount(r[4]), scheduled: toCount(r[5]), done, tokens: toCount(r[7]), walkIn };
          const prev = reports.get(k);
          if (prev) {
            // The old form allowed several submissions a day; they're added together (as the old MTD did).
            for (const [n, v] of Object.entries(nums)) prev[n] = (prev[n] as number) + v;
            prev.merged += 1;
          } else {
            reports.set(k, { key: `imp-${hashKey(`${slot.src}|summary|${normName(rawName)}|${date}`)}`, employeeId, date, type, projectId, ...nums, merged: 0 });
          }
        } else if (slot.kind === "done") {
          const status = (r[4] ?? "").trim();
          doneVisits.push({ key: keyFor(rawKey), employeeId, date, type, projectId, client: (r[2] ?? "").trim(), time: parseSheetTime(r[3] ?? ""),
            status, walkIn: type === "Sole Selling" && !!status && isWalkIn(status) });
        } else {
          const visitDate = parseSheetDate(r[3] ?? "", order);
          if (!visitDate) { errors.push(`${where}: can't read visit date "${r[3]}"`); return; }
          const resch = (r[4] ?? "").trim() ? parseSheetDate(r[4], order) : null;
          if ((r[4] ?? "").trim() && !resch) errors.push(`${where}: can't read reschedule date "${r[4]}" (kept without it)`);
          const st = (r[5] ?? "").trim();
          scheduledVisits.push({ key: keyFor(rawKey), employeeId, bookedOn: date, type, projectId, client: (r[2] ?? "").trim(), visitDate,
            rescheduleDate: resch, status: /^done$/i.test(st) ? "Done" : /^cancel/i.test(st) ? "Cancelled" : "Pending", reason: (r[6] ?? "").trim() });
        }
      });
    }
    const reportList = [...reports.values()];
    return {
      errors,
      reports: reportList,
      merged: reportList.reduce((n, r) => n + r.merged, 0),
      doneVisits, scheduledVisits,
      dates: reportList.map((r) => r.date as string).sort(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, order, names, projectFor, walkInStatuses, soleDoneHasWalkIns, emps, aliases.data, assignments.data]);

  const runImport = async () => {
    setImporting(true);
    try {
      const newEmployees = foundNames.flatMap(([k, raw]) => {
        const c = choiceFor(k);
        return c.mode === "create" ? [{ id: c.id.trim().toUpperCase(), name: raw }] : [];
      });
      const aliasRows = foundNames.flatMap(([k]) => {
        const c = choiceFor(k);
        const id = c.mode === "employee" ? c.employeeId : c.mode === "create" ? c.id.trim().toUpperCase() : null;
        return id && normName(empById.get(id)?.name ?? "") !== k ? [{ alias: k, employeeId: id }] : [];
      });
      const res = await api.importReports({
        newEmployees, aliases: aliasRows,
        reports: built.reports.map(({ merged: _m, ...r }) => r),
        doneVisits: built.doneVisits, scheduledVisits: built.scheduledVisits,
      });
      setResult(res);
      toast("Import finished.");
      employees.reload(); aliases.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setImporting(false);
    }
  };

  if (user && user.role !== "Admin") {
    return <div className="pt-4"><EmptyState icon={FileUp} title="Only an Admin can import data" /></div>;
  }

  // "Chirag Rawat (EMP012)" — also for people being created as inactive in step 2.
  const personLabel = (id: string) => {
    const known = empById.get(id)?.name;
    const created = foundNames.find(([k]) => { const c = choiceFor(k); return c.mode === "create" && c.id.trim().toUpperCase() === id; })?.[1];
    return `${known ?? created ?? id} (${id})`;
  };
  const anyFile = Object.keys(files).length > 0;
  const ready = anyFile && unresolved.length === 0 && missingProject.length === 0;
  const createdIds = new Set(foundNames.flatMap(([k]) => { const c = choiceFor(k); return c.mode === "create" ? [c.id.trim().toUpperCase()] : []; }));
  const clash = [...createdIds].filter((id) => empById.has(id));

  return (
    <div className="space-y-5 pt-2">
      <Link href="/reports" className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:text-ink md:min-h-0"><ArrowLeft className="h-4 w-4" /> Daily Reports</Link>
      <PageHeader title="Import old reports" subtitle="Upload the eight tabs of your two Google Sheets (Sheet1, Past Employee, Visits Done, Visits Scheduled) as CSV files. Nothing is saved until you press Import, and running it again won't create duplicates." />
      <ErrorBanner message={employees.error || projects.error} />
      {(employees.loading || projects.loading) && !employees.data && <Loading />}

      {/* 1. Files */}
      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-ink">1. Files</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SLOTS.map((s) => {
            const f = files[slotId(s)];
            return (
              <label key={slotId(s)} className={cn("block cursor-pointer rounded-xl border border-dashed p-3", f ? "border-status-success bg-status-successBg/40" : "border-surface-border hover:bg-surface")}>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {f ? <CheckCircle2 className="h-4 w-4 text-status-success" /> : <FileUp className="h-4 w-4 text-ink-faint" />} {s.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-faint">{f ? `${f.fileName} · ${f.rows.length} rows` : s.columns}</span>
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => readFile(s, e.target.files?.[0])} aria-label={`CSV file for ${s.label}`} />
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          Dates in the sheets are written as
          <Select ariaLabel="Date format in the sheets" value={order} onChange={(v) => setOrder(v as DateOrder)}
            options={[{ value: "DMY", label: "Day/Month/Year (24/10/2026)" }, { value: "MDY", label: "Month/Day/Year (10/24/2026)" }]} />
        </div>
      </Card>

      {/* 2. Names */}
      {foundNames.length > 0 && (
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">2. Names</h2>
            <span className={cn("text-xs", unresolved.length ? "text-status-danger" : "text-status-success")}>
              {unresolved.length ? `${unresolved.length} name${unresolved.length === 1 ? "" : "s"} still to match` : "All names matched"}
            </span>
          </div>
          <p className="text-xs text-ink-faint">Pick the employee each old name belongs to. People who have left can be created as Inactive (they can&apos;t sign in). Your choices are remembered for next time.</p>
          <ul className="divide-y divide-surface-border">
            {foundNames.map(([key, raw]) => {
              const c = choiceFor(key);
              const value = c.mode === "employee" ? c.employeeId : c.mode === "create" ? "__create" : c.mode === "skip" ? "__skip" : "";
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-[10rem] flex-1 text-sm font-medium text-ink">{raw}</span>
                  {c.mode === "employee" && c.suggested && !names[key] && <span className="rounded-full bg-status-warningBg px-2 py-0.5 text-xs text-status-warning">check</span>}
                  <Select ariaLabel={`Employee for ${raw}`} value={value} invalid={!value} placeholder="Choose…"
                    onChange={(v) => setNames((n) => ({ ...n, [key]: v === "__create" ? { mode: "create", id: suggestId(emps, n) } : v === "__skip" ? { mode: "skip" } : v ? { mode: "employee", employeeId: v } : { mode: "none" } }))}
                    options={[{ value: "", label: "Choose…" }, ...emps.map((e) => ({ value: e.id, label: `${e.name} (${e.id})${e.status === "Inactive" ? " · inactive" : ""}` })),
                      { value: "__create", label: "➕ Create as inactive employee" }, { value: "__skip", label: "Skip this person's rows" }]} />
                  {c.mode === "create" && (
                    <input aria-label={`New employee code for ${raw}`} value={c.id} placeholder="Code, e.g. EMP022"
                      onChange={(e) => setNames((n) => ({ ...n, [key]: { mode: "create", id: e.target.value } }))}
                      className="w-28 rounded-pill border border-surface-border px-3 py-2 text-sm uppercase" />
                  )}
                </li>
              );
            })}
          </ul>
          {clash.length > 0 && <p className="text-xs text-status-warning">Code {clash.join(", ")} already exists — that existing employee will be used.</p>}
        </Card>
      )}

      {/* 3. Sole selling projects */}
      {soleEmployees.length > 0 && (
        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">3. Sole selling projects</h2>
          <p className="text-xs text-ink-faint">The old Sole Selling sheet has no project column, so each person&apos;s rows go to the project chosen here.</p>
          <ul className="divide-y divide-surface-border">
            {soleEmployees.map((id) => (
              <li key={id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-[10rem] flex-1 text-sm font-medium text-ink">{personLabel(id)}</span>
                <Select ariaLabel={`Project for ${personLabel(id)}`} value={projectOf(id)} invalid={!projectOf(id)} placeholder="Choose project…"
                  onChange={(v) => setProjectFor((p) => ({ ...p, [id]: v }))}
                  options={activeProjects.map((p) => ({ value: p.id, label: `${p.name}${p.status === "Closed" ? " (closed)" : ""}` }))} />
              </li>
            ))}
          </ul>
          {activeProjects.length === 0 && <p className="text-xs text-status-danger">Add the projects first (Daily Reports → Projects).</p>}
          {(files["sole-summary"] || files["sole-past"]) && (
            <button type="button" role="checkbox" aria-checked={soleDoneHasWalkIns} onClick={() => setSoleDoneHasWalkIns((v) => !v)}
              className="flex w-full items-start gap-2.5 rounded-xl bg-surface p-3 text-left text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <span className="mt-0.5"><CheckBox checked={soleDoneHasWalkIns} /></span>
              <span>
                In the old Sole Selling Sheet1 / Past Employee, <b>Site Visit Done already includes Walk In</b> — take walk-ins out.
                <span className="mt-0.5 block text-xs text-ink-faint">In the panel, Site Visit Done never includes walk-ins. Check one old day: if its Site Visit Done equals the visits done plus the walk-ins, tick this.</span>
              </span>
            </button>
          )}
          {soleStatuses.length > 0 && (
            <div className="rounded-xl bg-surface p-3 text-sm">
              <p className="mb-2 text-xs text-ink-muted">Rows in Sole Selling “Visits Done” with these Status values are walk-ins (shown in the Walk In list, not as visits):</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {soleStatuses.map((st) => (
                  <CheckRow key={st} checked={isWalkIn(st)} onChange={(on) => setWalkInStatuses((w) => ({ ...w, [st]: on }))} label={st} />
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 4. Preview + import */}
      {anyFile && (
        <Card className="space-y-4 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-ink">4. Preview</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Daily reports" value={built.reports.length} note={built.merged ? `${built.merged} same-day rows added together` : undefined} />
            <Stat label="Visits done" value={built.doneVisits.filter((v) => !v.walkIn).length} />
            <Stat label="Walk-ins" value={built.doneVisits.filter((v) => v.walkIn).length} />
            <Stat label="Visits scheduled" value={built.scheduledVisits.length} />
          </div>
          {built.dates.length > 0 && <p className="text-xs text-ink-faint">Reports from {formatDate(built.dates[0])} to {formatDate(built.dates[built.dates.length - 1])}. Days that already have a report in the panel are skipped.</p>}
          {built.errors.length > 0 && (
            <details className="rounded-xl bg-status-warningBg/60 p-3 text-sm text-status-warning">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> {built.errors.length} row problem{built.errors.length === 1 ? "" : "s"} (these rows are left out)</summary>
              <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-xs">{built.errors.slice(0, 200).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
          {built.reports.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead><tr className="text-left text-ink-faint">{["Person", "Date", "Report", "FL", "CM", "P", "SVS", "SVD", "WI", "B"].map((h, i) => <th key={h} className={i === 0 ? "sticky left-0 bg-white px-2 py-1.5 font-medium" : "px-2 py-1.5 font-medium"}>{h}</th>)}</tr></thead>
                <tbody>
                  {built.reports.slice(0, 15).map((r) => (
                    <tr key={r.key as string} className="border-t border-surface-border">
                      <td className="sticky left-0 max-w-[8rem] truncate bg-white px-2 py-1.5 font-medium sm:max-w-none">{personLabel(r.employeeId as string)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{formatDate(r.date as string)}</td>
                      <td className="px-2 py-1.5">{r.type === "Normal" ? "Normal" : activeProjects.find((p) => p.id === r.projectId)?.name}</td>
                      {(["leads", "calls", "positive", "scheduled", "done", "walkIn", "tokens"] as const).map((k) => <td key={k} className="px-2 py-1.5">{r[k] as number}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {built.reports.length > 15 && <p className="mt-1 text-xs text-ink-faint">…and {built.reports.length - 15} more.</p>}
            </div>
          )}
          {!ready && <p className="text-sm text-status-danger">{unresolved.length ? "Match every name in step 2 first." : missingProject.length ? "Choose a project for every sole selling person in step 3." : ""}</p>}
          <PrimaryButton onClick={runImport} disabled={!ready || importing} className="w-full justify-center sm:w-auto">
            {importing ? "Importing…" : "Import"}
          </PrimaryButton>
          {result && (
            <div className="rounded-xl bg-status-successBg p-3 text-sm text-status-success">
              Imported {result.reports} reports ({result.reportsSkipped} already there), {result.doneVisits} visits done, {result.walkIns} walk-ins,
              {" "}{result.scheduledVisits} scheduled visits{result.newEmployees ? `, ${result.newEmployees} new inactive employees` : ""}.
              {result.unlinked ? ` ${result.unlinked} visit/walk-in rows had no matching daily report on that day.` : ""} Running it again only adds rows that are new.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-surface-border p-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="text-xl font-semibold text-ink">{value}</p>
      {note && <p className="text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}

/** Next employee code after the highest one in use (e.g. EMP022), for a new inactive employee. */
function suggestId(emps: Employee[], choices: Record<string, NameChoice>) {
  const used = [...emps.map((e) => e.id), ...Object.values(choices).flatMap((c) => (c.mode === "create" ? [c.id.toUpperCase()] : []))];
  const max = Math.max(0, ...used.map((id) => /^EMP(\d+)$/.exec(id)?.[1]).filter(Boolean).map(Number));
  return `EMP${String(max + 1).padStart(3, "0")}`;
}
