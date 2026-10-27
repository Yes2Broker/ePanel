import { supabase } from "@/lib/supabase";

/**
 * Y2B Assist's read-only tools. Each one calls the panel's existing database
 * functions with the person's OWN session token, so the database decides what
 * they may see (an employee's token can never read someone else's data).
 * Nothing here writes, edits or deletes.
 *
 * Groq's free plan counts tokens, so descriptions are one line, schemas are
 * minimal and results keep only what's needed to answer (max 15 rows).
 */
export type Role = "Employee" | "HR" | "Admin";
interface Ctx { token: string; today: string }
interface Tool {
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
  managers?: boolean;
}

const MAX_ROWS = 15;

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const monthOf = (ctx: Ctx, m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : ctx.today.slice(0, 7));
const dateOf = (ctx: Ctx, d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ctx.today);
const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const none = { type: "object", properties: {} };
const monthArg = { type: "object", properties: { month: { type: "string" } } };

type Row = Record<string, unknown>;
/** Rows as a header + arrays (far fewer tokens than objects), max `n`, plus how many were left out. */
const table = (cols: string[], rows: unknown[][], n = MAX_ROWS) => ({ cols, rows: rows.slice(0, n), ...(rows.length > n ? { more: rows.length - n } : {}) });
const short = (s: unknown, n = 50) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s);
const md = (d: unknown) => String(d ?? "").slice(5); // "2026-10-26" → "10-26"

const reports = (rows: Row[]) => {
  const t: Record<string, number> = { reports: rows.length };
  for (const [k, f] of [["leads", "leads"], ["calls", "calls"], ["positive", "positive"], ["visitsDone", "done"], ["tokens", "tokens"]]) {
    t[k] = rows.reduce((s, r) => s + Number(r[f] ?? 0), 0);
  }
  const multi = new Set(rows.map((r) => r.title)).size > 1;
  return {
    totals: t,
    list: table(["date", ...(multi ? ["report"] : []), "leads", "calls", "done", "tokens"],
      rows.map((r) => [md(r.date), ...(multi ? [r.title] : []), r.leads, r.calls, r.done, r.tokens])),
  };
};
// Attendance: the summary, plus only the days worth mentioning.
const attendance = (a: Row & { summary: Row; days: Row[]; employee: Row }) => {
  const s = a.summary;
  const notable = a.days.filter((d) => (d.late || d.shortDay || d.status === "Absent" || d.status === "Paid Leave") && (d.hasRow || d.status !== "Absent"))
    .map((d) => [md(d.date), [d.status, d.late && "late", d.shortDay && "short"].filter(Boolean).join(" "), d.in ? `${d.in}-${d.out ?? "?"}` : ""]);
  return {
    name: a.employee?.name, month: String(a.month ?? "").slice(0, 7),
    summary: { present: s.present, absent: s.absent, weekoff: s.weekoff, paidLeave: s.paidLeave, lates: s.lates, lateDeduction: s.lateDeduction,
      shortDays: s.shortDays, netPayable: s.netPayable, upTo: s.lastDay },
    days: table(["date", "status", "time"], notable),
  };
};

/** HR/Admin: "Pavan" / "EMP003" → employee ID, or an error to give back. */
async function personId(ctx: Ctx, person: string) {
  const q = person.toLowerCase().trim();
  const all = (await call("list_employees", { p_token: ctx.token })) as Row[];
  const exact = all.find((e) => String(e.id).toLowerCase() === q);
  if (exact) return { id: String(exact.id) };
  const hits = all.filter((e) => String(e.name).toLowerCase().includes(q));
  if (hits.length === 1) return { id: String(hits[0].id) };
  return { error: hits.length ? `Several match: ${hits.slice(0, 5).map((e) => e.name).join(", ")}` : `No one called ${person}` };
}
const NOT_YOURS = { error: "That information isn't available to you." };
const isManager = (role: Role) => role === "HR" || role === "Admin";

interface ToolDef extends Omit<Tool, "run"> { run: (ctx: Ctx, args: Record<string, string | undefined>, role: Role) => Promise<unknown> }
const person = { type: "string", description: "name or ID; omit for me" };

export const TOOLS: ToolDef[] = [
  {
    name: "my_visits", description: "My pending site visits (today, upcoming, overdue).", parameters: none,
    run: async (ctx) => {
      const v = (await call("assist_my_visits", { p_token: ctx.token })) as Row[];
      return table(["date", "client", "report", "overdue"], v.map((x) => [md(x.date), x.client, x.report, x.overdue ? 1 : 0]));
    },
  },
  {
    name: "reports", description: "Daily reports + totals for a month (YYYY-MM) or date.",
    parameters: { type: "object", properties: { month: { type: "string" }, date: { type: "string" } } },
    run: async (ctx, a, role) => {
      const m = a.date ? a.date.slice(0, 7) : monthOf(ctx, a.month);
      if (a.person && !isManager(role)) return NOT_YOURS;
      let rows: Row[];
      if (a.person) {
        const p = await personId(ctx, a.person);
        if (p.error) return p;
        rows = (await call("list_sales_reports", { p_token: ctx.token, p_from: `${m}-01`, p_to: monthEnd(m), p_type: null, p_project: null, p_employee_id: p.id })) as Row[];
      } else rows = (await call("my_sales_reports", { p_token: ctx.token, p_month: `${m}-01` })) as Row[];
      if (a.date) rows = rows.filter((r) => r.date === a.date);
      return { month: m, ...reports(rows) };
    },
  },
  {
    name: "attendance", description: "Attendance summary for a month (YYYY-MM).", parameters: monthArg,
    run: async (ctx, a, role) => {
      if (a.person && !isManager(role)) return NOT_YOURS;
      const p = a.person ? await personId(ctx, a.person) : { id: null };
      if ("error" in p && p.error) return p;
      return attendance(await call("att_month", { p_token: ctx.token, p_emp: p.id ?? null, p_month: `${monthOf(ctx, a.month)}-01` }));
    },
  },
  {
    name: "my_leave", description: "My leave requests and leave taken.", parameters: none,
    run: async (ctx) => {
      const o = await call("leave_overview", { p_token: ctx.token });
      return { taken: o.stats, list: table(["from", "to", "days", "status", "reason"],
        (o.applications as Row[]).map((x) => [md(x.start), md(x.end), x.days, x.status, short(x.reason, 40)]), 10) };
    },
  },
  {
    name: "today_report_status", description: "My reports to file today and whether each is filed.", parameters: none,
    run: async (ctx) => ((await call("report_options", { p_token: ctx.token })) as Row[]).map((o) => ({ report: o.title, filed: !!o.todayReportId })),
  },
  // ---- HR / Admin ----
  {
    name: "team_summary", managers: true, description: "Team report numbers for a date (YYYY-MM-DD).",
    parameters: { type: "object", properties: { date: { type: "string" } } },
    run: async (ctx, a) => {
      const groups = (await call("team_report_summary", { p_token: ctx.token, p_date: dateOf(ctx, a.date), p_type: null, p_project: null, p_employee_id: null })) as Row[];
      const nums = (t: Row) => [t.leads, t.calls, t.done, t.tokens];
      return { date: dateOf(ctx, a.date), cols: ["leads", "calls", "done", "tokens"], groups: groups.map((g) => ({
        report: g.title, day: nums((g.totals as Row).today as Row), month: nums((g.totals as Row).mtd as Row),
        people: table(["name", "filed", "leads", "calls", "done", "tokens"],
          (g.rows as Row[]).map((r) => [r.employeeName, r.filedToday ? 1 : r.off ?? 0, ...nums(r.today as Row)])),
      })) };
    },
  },
  {
    name: "not_filed_today", managers: true, description: "Who hasn't filed today's report; who is off.", parameters: none,
    run: async (ctx) => {
      const r = (await call("assist_not_filed", { p_token: ctx.token })) as { notFiled: Row[]; off: Row[] };
      return { count: r.notFiled.length, notFiled: r.notFiled.slice(0, MAX_ROWS).map((x) => `${x.name} (${(x.missing as string[]).join(", ")})`),
        off: r.off.slice(0, 10).map((x) => `${x.name}: ${x.off}`) };
    },
  },
  {
    name: "attendance_checks", managers: true, description: "Who checked their attendance for a month (YYYY-MM).", parameters: monthArg,
    run: async (ctx, a) => {
      const rows = (await call("att_checks", { p_token: ctx.token, p_month: `${monthOf(ctx, a.month)}-01` })) as Row[];
      const not = rows.filter((r) => !r.checkedAt).map((r) => (r.employee as Row)?.name);
      return { month: monthOf(ctx, a.month), checked: rows.length - not.length, total: rows.length, notChecked: not.slice(0, 10), ...(not.length > 10 ? { more: not.length - 10 } : {}) };
    },
  },
  {
    name: "pending_leave", managers: true, description: "Leave requests waiting for a decision.", parameters: none,
    run: async (ctx) => table(["name", "from", "to", "days", "reason", "warning"],
      ((await call("leave_queue", { p_token: ctx.token, p_status: "Pending" })) as Row[]).map((x) => [
        (x.employee as Row)?.name, md(x.start), md(x.end), x.days, short(x.reason, 40), short((x.warnings as string[] | undefined)?.[0], 50) ?? "",
      ]), 10),
  },
];

/** The tools this role may use. HR/Admin's reports + attendance take a person (name or ID). */
export const toolsFor = (role: Role) => TOOLS.filter((t) => !t.managers || isManager(role)).map((t) =>
  isManager(role) && (t.name === "reports" || t.name === "attendance")
    ? { ...t, parameters: { ...t.parameters, properties: { ...(t.parameters.properties as object), person } } }
    : t);

/** Runs one tool for this person, or explains why not. Never throws. */
export async function runTool(role: Role, ctx: Ctx, name: string, rawArgs: string) {
  const tool = toolsFor(role).find((t) => t.name === name);
  if (!tool) return { error: "That information isn't available to you." };
  let args: Record<string, string | undefined> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { error: "Bad tool arguments." }; }
  if (args.employee_id && !args.person) args.person = args.employee_id;
  try {
    return await tool.run(ctx, args, role);
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 120) : "Couldn't load that." };
  }
}
