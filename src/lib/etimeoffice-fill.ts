import type { Employee } from "@/types";
import type { ETimeOfficeReport } from "@/lib/attendance-parse";
import type { TemplateFill } from "@/lib/attendance-template";

/**
 * "Fill from eTimeOffice": matches the report's employee blocks to panel employees
 * and builds the pre-fill + accuracy checks for the monthly template. Everything
 * comes from the live employee list and the report; nothing is hard-coded.
 * `resolve` turns a machine code into a panel id the same way the upload does
 * (saved code map, then 0002 → EMP002).
 */
export interface FillSummary {
  people: { id: string; name: string; reportDays: number; filledDays: number; singles: number; ok: boolean }[];
  notInPanel: { code: string; name: string; why: string }[];
  missing: { id: string; name: string }[];
  mismatched: { code: string; reportName: string; id: string; panelName: string }[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const singlesText = (n: number) => `${n} day${n === 1 ? " needs" : "s need"} an In or Out time`;
const words = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

/** Same person? First names equal, or every word of the shorter name is in the longer one. */
export function namesMatch(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return x[0] === y[0] || short.every((w) => long.includes(w));
}

export async function prepareFill(report: ETimeOfficeReport, employees: Employee[], month: string, resolve: (code: string) => Promise<string | null>) {
  // The report's month must be the template month.
  let reportMonth = report.month;
  if (!reportMonth) {
    const count: Record<string, number> = {};
    for (const p of report.people) for (const d of Object.keys(p.days)) count[d.slice(0, 7)] = (count[d.slice(0, 7)] ?? 0) + 1;
    reportMonth = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  if (reportMonth !== month) {
    throw new Error(reportMonth
      ? `This report is for ${label(reportMonth)}, but the template month is ${label(month)}. Pick ${label(reportMonth)} and try again.`
      : "Couldn't find the month in this report.");
  }
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const monthEnd = `${month}-${String(last).padStart(2, "0")}`;
  const inTemplate = (e: Employee) => e.status === "Active" && e.role !== "Admin" && (!e.joiningDate || e.joiningDate <= monthEnd);

  const times: TemplateFill["times"] = {};
  const summary: FillSummary = { people: [], notInPanel: [], missing: [], mismatched: [] };
  const ids = await Promise.all(report.people.map((p) => resolve(p.code)));
  report.people.forEach((p, i) => {
    const emp = employees.find((e) => e.id === ids[i]);
    if (!emp) return void summary.notInPanel.push({ code: p.code, name: p.name, why: "not in the panel" });
    if (!inTemplate(emp)) return void summary.notInPanel.push({ code: p.code, name: p.name, why: emp.status !== "Active" ? "inactive" : emp.role === "Admin" ? "Admin" : "joins later" });
    if (!namesMatch(p.name, emp.name) || times[emp.id]) return void summary.mismatched.push({ code: p.code, reportName: p.name, id: emp.id, panelName: emp.name });
    const from = emp.joiningDate && emp.joiningDate > `${month}-01` ? emp.joiningDate : `${month}-01`;
    const days = Object.entries(p.days).filter(([d]) => d.startsWith(month));
    times[emp.id] = Object.fromEntries(days.filter(([d]) => d >= from && d <= monthEnd));
    const reportDays = days.filter(([, t]) => t.in).length;
    const filledDays = Object.values(times[emp.id]).filter((t) => t.in).length;
    const singles = Object.values(times[emp.id]).filter((t) => !t.in !== !t.out).length;
    summary.people.push({ id: emp.id, name: emp.name, reportDays, filledDays, singles, ok: reportDays === filledDays });
  });
  const seen = new Set([...Object.keys(times), ...summary.mismatched.map((m) => m.id)]);
  summary.missing = employees.filter((e) => inTemplate(e) && !seen.has(e.id)).map((e) => ({ id: e.id, name: e.name }));

  const all = (cells: string[][]) => cells.map((c) => ({ cells: c, bad: true }));
  const check: TemplateFill["check"] = [{
    title: `eTimeOffice → template check (${label(month)})`,
    rows: [{ cells: ["Employee", "Days with IN (report)", "Days filled (template)", "Single punches to fix"] },
      ...summary.people.map((p) => ({ cells: [`${p.name} (${p.id})`, String(p.reportDays), String(p.filledDays), p.singles ? singlesText(p.singles) : ""], bad: !p.ok }))],
  }];
  if (summary.notInPanel.length) check.push({ title: "In the report but not added", rows: all(summary.notInPanel.map((x) => [`${x.name} (${x.code})`, x.why])), bad: true });
  if (summary.mismatched.length) check.push({ title: "Code and name don't match (not filled)", rows: all(summary.mismatched.map((x) => [`${x.reportName} (${x.code})`, `panel: ${x.panelName} (${x.id})`])), bad: true });
  if (summary.missing.length) check.push({ title: "Active in the panel but not in the report (rows left empty)", rows: all(summary.missing.map((x) => [`${x.name} (${x.id})`])), bad: true });
  return { fill: { times, check } as TemplateFill, summary };
}
