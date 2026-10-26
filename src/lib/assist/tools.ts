import { supabase } from "@/lib/supabase";

/**
 * Y2B Assist's read-only tools. Each one calls the panel's existing database
 * functions with the person's OWN session token, so the database decides what
 * they may see (an employee's token can never read someone else's data).
 * Nothing here writes, edits or deletes.
 */
export type Role = "Employee" | "HR" | "Admin";
interface Ctx { token: string; today: string }
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  managers?: boolean;
  run: (ctx: Ctx, args: Record<string, string | undefined>) => Promise<unknown>;
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const monthOf = (ctx: Ctx, m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : ctx.today.slice(0, 7));
const dateOf = (ctx: Ctx, d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ctx.today);
const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const month = { type: "string", description: "Month as YYYY-MM. Leave out for this month." };

type Row = Record<string, unknown>;
const reportRows = (rows: Row[]) => rows.map((r) => ({
  id: r.id, date: r.date, name: r.employeeName, report: r.title, leads: r.leads, calls: r.calls, positiveCalls: r.positive,
  visitsScheduled: r.scheduled, visitsDone: r.done, tokens: r.tokens, walkIns: r.walkIn,
}));
const totals = (rows: Row[]) => {
  const t: Record<string, number> = { reports: rows.length };
  for (const k of ["leads", "calls", "positive", "scheduled", "done", "tokens", "walkIn"]) t[k] = rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return t;
};
const attendance = (a: Row & { summary: Row; days: Row[]; employee: Row }) => ({
  employee: { id: a.employee?.id, name: a.employee?.name }, month: a.month, summary: a.summary,
  days: a.days.filter((d) => d.hasRow || d.status !== "Absent").map((d) => ({
    date: d.date, status: d.status, in: d.in, out: d.out, late: d.late, shortDay: d.shortDay, note: d.note || undefined,
  })),
});

export const TOOLS: Tool[] = [
  {
    name: "my_visits", description: "The signed-in person's pending site visits: today, upcoming, and overdue ones from the last week.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => call("assist_my_visits", { p_token: ctx.token }),
  },
  {
    name: "my_reports", description: "The signed-in person's own daily reports for a month (or one date), with totals.",
    parameters: { type: "object", properties: { month, date: { type: "string", description: "One date as YYYY-MM-DD (optional)." } } },
    run: async (ctx, a) => {
      const m = a.date ? a.date.slice(0, 7) : monthOf(ctx, a.month);
      let rows = (await call("my_sales_reports", { p_token: ctx.token, p_month: `${m}-01` })) as Row[];
      if (a.date) rows = rows.filter((r) => r.date === a.date);
      return { month: m, date: a.date, totals: totals(rows), reports: reportRows(rows) };
    },
  },
  {
    name: "my_attendance", description: "The signed-in person's attendance for a month: summary (present, absent, lates, short days, payable days) and each day.",
    parameters: { type: "object", properties: { month } },
    run: async (ctx, a) => attendance(await call("att_month", { p_token: ctx.token, p_emp: null, p_month: `${monthOf(ctx, a.month)}-01` })),
  },
  {
    name: "my_leave", description: "The signed-in person's leave requests and the leave they've taken this month / year.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => {
      const o = await call("leave_overview", { p_token: ctx.token });
      return { today: o.today, taken: o.stats, requests: (o.applications as Row[]).map((x) => ({
        from: x.start, to: x.end, half: x.half, days: x.days, status: x.status, reason: x.reason, decisionNote: x.decisionNote, cancelledFrom: x.cancelledFrom,
      })) };
    },
  },
  {
    name: "today_report_status", description: "Which daily reports the signed-in person has to file and whether each is filed today.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => ((await call("report_options", { p_token: ctx.token })) as Row[]).map((o) => ({ report: o.title, filedToday: !!o.todayReportId, reportId: o.todayReportId })),
  },
  // ---- HR / Admin ----
  {
    name: "team_summary", managers: true, description: "HR/Admin: team daily report totals for a date: each person's numbers that day and month-to-date, per report.",
    parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD. Leave out for today." } } },
    run: async (ctx, a) => {
      const groups = (await call("team_report_summary", { p_token: ctx.token, p_date: dateOf(ctx, a.date), p_type: null, p_project: null, p_employee_id: null })) as Row[];
      return { date: dateOf(ctx, a.date), groups: groups.map((g) => ({ report: g.title, totals: g.totals,
        people: (g.rows as Row[]).map((r) => ({ name: r.employeeName, filed: r.filedToday, off: r.off ?? undefined, day: r.today, monthToDate: r.mtd })) })) };
    },
  },
  {
    name: "not_filed_today", managers: true, description: "HR/Admin: who hasn't filed today's daily report(s) yet, and who is on leave / weekly off today.",
    parameters: { type: "object", properties: {} },
    run: (ctx) => call("assist_not_filed", { p_token: ctx.token }),
  },
  {
    name: "attendance_checks", managers: true, description: "HR/Admin: how many people have checked their updated attendance for a month, and who hasn't.",
    parameters: { type: "object", properties: { month } },
    run: async (ctx, a) => {
      const rows = (await call("att_checks", { p_token: ctx.token, p_month: `${monthOf(ctx, a.month)}-01` })) as Row[];
      const name = (r: Row) => (r.employee as Row)?.name;
      return { month: monthOf(ctx, a.month), checked: rows.filter((r) => r.checkedAt).length, total: rows.length,
        notChecked: rows.filter((r) => !r.checkedAt).map(name), checkedBy: rows.filter((r) => r.checkedAt).map(name) };
    },
  },
  {
    name: "pending_leave", managers: true, description: "HR/Admin: leave requests waiting for a decision, with warnings.",
    parameters: { type: "object", properties: {} },
    run: async (ctx) => ((await call("leave_queue", { p_token: ctx.token, p_status: "Pending" })) as Row[]).map((x) => ({
      name: (x.employee as Row)?.name, from: x.start, to: x.end, days: x.days, reason: x.reason, warnings: x.warnings, appliedOn: x.createdAt,
    })),
  },
  {
    name: "find_employee", managers: true, description: "HR/Admin: find a person's employee ID by (part of) their name.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    run: async (ctx, a) => {
      const q = (a.name ?? "").toLowerCase().trim();
      return ((await call("list_employees", { p_token: ctx.token })) as Row[])
        .filter((e) => !q || String(e.name).toLowerCase().includes(q) || String(e.id).toLowerCase() === q)
        .map((e) => ({ id: e.id, name: e.name, department: e.department, role: e.role, status: e.status }));
    },
  },
  {
    name: "person_reports", managers: true, description: "HR/Admin: one person's daily reports for a month, with totals. Use find_employee first for the ID.",
    parameters: { type: "object", properties: { employee_id: { type: "string" }, month }, required: ["employee_id"] },
    run: async (ctx, a) => {
      const m = monthOf(ctx, a.month);
      const rows = (await call("list_sales_reports", { p_token: ctx.token, p_from: `${m}-01`, p_to: monthEnd(m), p_type: null, p_project: null, p_employee_id: a.employee_id })) as Row[];
      return { month: m, totals: totals(rows), reports: reportRows(rows) };
    },
  },
  {
    name: "person_attendance", managers: true, description: "HR/Admin: one person's attendance for a month (summary and days). Use find_employee first for the ID.",
    parameters: { type: "object", properties: { employee_id: { type: "string" }, month }, required: ["employee_id"] },
    run: async (ctx, a) => attendance(await call("att_month", { p_token: ctx.token, p_emp: a.employee_id, p_month: `${monthOf(ctx, a.month)}-01` })),
  },
];

export const toolsFor = (role: Role) => TOOLS.filter((t) => !t.managers || role === "HR" || role === "Admin");

/** Runs one tool for this person, or explains why not. Never throws. */
export async function runTool(role: Role, ctx: Ctx, name: string, rawArgs: string) {
  const tool = toolsFor(role).find((t) => t.name === name);
  if (!tool) return { error: "That information isn't available to you." };
  let args: Record<string, string | undefined> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { error: "Bad tool arguments." }; }
  try {
    return await tool.run(ctx, args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load that." };
  }
}
