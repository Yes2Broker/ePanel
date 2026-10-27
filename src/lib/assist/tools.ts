import { supabase } from "@/lib/supabase";
import { Area, NO_OWN_REPORTS, OWN_ONLY, Perms, areasOf, filesReports, noAccess } from "@/lib/assist/access";
import { Period, dayLabel, monthLabel, prevMonth, thisMonth, todayPeriod } from "@/lib/assist/period";

/**
 * Y2B Assist's read-only tools. Each one calls the panel's existing database
 * functions with the person's OWN session token, so the database decides what
 * they may see (an employee's token can never read someone else's data).
 * Nothing here writes, edits or deletes.
 *
 * Dates are never chosen by the model: the server works out the period from
 * the question (period.ts) and the tools use it. Results are compact (Groq's
 * free plan counts tokens), say which period they cover, and give a one-line
 * "say" when there's nothing to show.
 */
export type Role = "Employee" | "HR" | "Admin";
const AREA: Record<string, Area> = {
  my_visits: "reports", reports: "reports", today_report_status: "reports", team_summary: "reports", not_filed_today: "reports",
  attendance: "attendance", attendance_checks: "attendance", my_leave: "leave", pending_leave: "leave",
};
interface Ctx { token: string; today: string; period: Period | null; me: { id: string; name: string }; files: boolean; hinglish?: boolean }
interface Tool {
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
  managers?: boolean;
}
interface ToolDef extends Tool { run: (ctx: Ctx, args: Record<string, string | undefined>, role: Role) => Promise<unknown> }

const MAX_ROWS = 15;
const none = { type: "object", properties: {} };
const isManager = (role: Role) => role === "HR" || role === "Admin";
// "final": the route gives this line as the whole answer, without the model.
const NOT_YOURS = { final: OWN_ONLY };
/** "Sachin", "Sachin Prajapati" or "EMP002" naming the person themselves. */
const isMe = (ctx: Ctx, person: string) => {
  const q = person.toLowerCase().trim(), n = ctx.me.name.toLowerCase();
  return q === ctx.me.id.toLowerCase() || q === n || q === n.split(" ")[0] || q === "me" || q === "myself";
};

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

type Row = Record<string, unknown>;
/** Rows as a header + arrays (far fewer tokens than objects), max `n`, plus how many were left out. */
const table = (cols: string[], rows: unknown[][], n = MAX_ROWS) => ({ cols, rows: rows.slice(0, n), ...(rows.length > n ? { more: rows.length - n } : {}) });
const short = (s: unknown, n = 50) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "…" : s);
const md = (d: unknown) => String(d ?? "").slice(5); // "2026-10-26" → "10-26"
const n1 = (v: unknown) => Number(Number(v ?? 0).toFixed(1));
const monthsIn = (p: Period) => {
  const out = [p.from.slice(0, 7)];
  while (out[out.length - 1] < p.to.slice(0, 7)) { const [y, m] = out[out.length - 1].split("-").map(Number); out.push(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`); }
  return out;
};
const monthPeriodOf = (ctx: Ctx): Period => (ctx.period ? monthOnly(ctx.period.month) : thisMonth(ctx.today));
const monthOnly = (ym: string) => { const [y, m] = ym.split("-").map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { kind: "month" as const, from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}`, month: ym, label: monthLabel(ym) }; };

/** HR/Admin: "Pavan" / "EMP003" → employee, or an error to give back. */
async function findPerson(ctx: Ctx, person: string) {
  const q = person.toLowerCase().trim();
  const all = (await call("list_employees", { p_token: ctx.token })) as Row[];
  const exact = all.find((e) => String(e.id).toLowerCase() === q);
  if (exact) return { id: String(exact.id), name: String(exact.name), role: String(exact.role) };
  const hits = all.filter((e) => String(e.name).toLowerCase().includes(q));
  if (hits.length === 1) return { id: String(hits[0].id), name: String(hits[0].name), role: String(hits[0].role) };
  return { error: hits.length ? `Several match: ${hits.slice(0, 5).map((e) => e.name).join(", ")}` : `No one called ${person}` };
}

/** Reports in the period (own, or one person's for HR/Admin). */
async function reportRows(ctx: Ctx, p: Period, employeeId: string | null) {
  let rows: Row[] = [];
  if (employeeId) rows = (await call("list_sales_reports", { p_token: ctx.token, p_from: p.from, p_to: p.to, p_type: null, p_project: null, p_employee_id: employeeId })) as Row[];
  else for (const m of monthsIn(p)) rows.push(...((await call("my_sales_reports", { p_token: ctx.token, p_month: `${m}-01` })) as Row[]));
  return rows.filter((r) => String(r.date) >= p.from && String(r.date) <= p.to);
}

const attSummary = (a: Row & { summary: Row; days: Row[] }) => {
  const s = a.summary;
  const out: Record<string, unknown> = { payableDays: n1(s.netPayable), daysInMonth: s.daysInMonth, present: n1(s.present), weeklyOff: n1(s.weekoff), absent: n1(s.absent), paidLeave: n1(s.paidLeave),
    lates: s.lates, latesCounted: Number(s.lateDeduction ?? 0) * 2, lateDeduction: n1(s.lateDeduction), shortDays: s.shortDays, upTo: md(s.lastDay) };
  // Zeros are left out (fewer tokens); payable days and lates always stay.
  for (const k of ["absent", "paidLeave", "latesCounted", "lateDeduction", "shortDays"]) if (!Number(out[k])) delete out[k];
  return out as { payableDays: number; lates: number; latesCounted?: number; [k: string]: unknown };
};

export const TOOLS: ToolDef[] = [
  {
    name: "my_visits", description: "My site visits (pending list, or visits done in a past period).", parameters: none,
    run: async (ctx) => {
      const p = ctx.period;
      // A past period: pending visits are gone, so count what the reports recorded.
      if (p && p.to < ctx.today) {
        const rows = await reportRows(ctx, p, null);
        const done = rows.reduce((s, r) => s + Number(r.done ?? 0), 0), sched = rows.reduce((s, r) => s + Number(r.scheduled ?? 0), 0);
        if (!done && !sched) return { period: p.label, say: `**No site visits recorded in ${p.label}.**` };
        return { period: p.label, visitsDone: done, visitsScheduled: sched, byDay: table(["date", "visits done", "visits scheduled"], rows.filter((r) => Number(r.done) || Number(r.scheduled)).map((r) => [md(r.date), r.done, r.scheduled]), 10) };
      }
      let v = (await call("assist_my_visits", { p_token: ctx.token })) as Row[];
      if (p?.kind === "day") v = v.filter((x) => x.date === p.from);
      else if (p) v = v.filter((x) => String(x.date) >= p.from && String(x.date) <= p.to);
      const label = p ? p.label : "upcoming";
      if (!v.length) return { period: label, say: `**No site visits ${p?.kind === "day" ? (p.from === ctx.today ? `today (${p.label.replace("today, ", "")})` : `on ${p.label}`) : `in ${label}`}.**` };
      return { period: label, count: v.length, visits: table(["date", "client", "report", "overdue"], v.map((x) => [md(x.date), x.client, x.report, x.overdue ? 1 : 0])) };
    },
  },
  {
    name: "reports", description: "Daily reports and totals for the period.", parameters: none,
    run: async (ctx, a, role) => {
      if (a.person && !isManager(role)) { if (!isMe(ctx, a.person)) return NOT_YOURS; a.person = undefined; }
      if (!a.person && !ctx.files) return { final: NO_OWN_REPORTS };
      const p = ctx.period ?? thisMonth(ctx.today);
      let who: string | null = null, name = "";
      if (a.person) { const f = await findPerson(ctx, a.person); if ("error" in f) return f; who = f.id; name = f.name; }
      const rows = await reportRows(ctx, p, who);
      if (!rows.length) return { period: p.label, say: `**No reports${name ? ` from ${name}` : ""} in ${p.label}.**` };
      const sum = (f: string) => rows.reduce((s, r) => s + Number(r[f] ?? 0), 0);
      const multi = new Set(rows.map((r) => r.title)).size > 1;
      const walkIns = sum("walkIn");
      return { period: `${p.label}${p.to >= ctx.today && p.from <= ctx.today && p.kind !== "day" ? " (so far)" : ""}`, who: name || "you", reports: rows.length,
        totals: { leads: sum("leads"), calls: sum("calls"), positiveCalls: sum("positive"), visitsScheduled: sum("scheduled"), visitsDone: sum("done"), ...(walkIns ? { walkIns } : {}), tokens: sum("tokens") },
        list: table(["date", ...(multi ? ["report"] : []), "leads", "calls", "visits done", "tokens"], rows.map((r) => [md(r.date), ...(multi ? [r.title] : []), r.leads, r.calls, r.done, r.tokens]), 10) };
    },
  },
  {
    name: "attendance", description: "Attendance for the period: payable days, lates, short days, notable days.", parameters: none,
    run: async (ctx, a, role) => {
      if (a.person && !isManager(role)) { if (!isMe(ctx, a.person)) return NOT_YOURS; a.person = undefined; }
      let emp: string | null = null, name = "";
      if (a.person) {
        const f = await findPerson(ctx, a.person); if ("error" in f) return f;
        if (f.role === "Admin") return { say: `**${f.name} is an Admin and has no attendance.**` };
        emp = f.id; name = f.name;
      } else if (role === "Admin") return { say: "**Admins have no attendance of their own.** Ask about a person, e.g. \"Pavan's attendance last month\"." };
      const p = monthPeriodOf(ctx);
      const load = (ym: string) => call("att_month", { p_token: ctx.token, p_emp: emp, p_month: `${ym}-01` }) as Promise<Row & { summary: Row; days: Row[] }>;
      const att = await load(p.month);
      if (!att.summary?.lastDay) {
        // Not uploaded yet: say so, and give the latest month that is.
        for (let ym = prevMonth(p.month), i = 0; i < 6; ym = prevMonth(ym), i++) {
          const prev = await load(ym);
          if (!prev.summary?.lastDay) continue;
          const s = attSummary(prev);
          const lates = `${s.lates} late${s.lates === 1 ? "" : "s"} (${s.latesCounted ?? 0} counted)`;
          return { period: p.label, say: ctx.hinglish
            ? `**${p.label} abhi upload nahi hua.** Last uploaded: ${monthLabel(ym)} – ${s.payableDays} payable days, ${lates}.`
            : `**${p.label} isn't uploaded yet** (HR uploads at month end).\nLast uploaded: **${monthLabel(ym)}: ${s.payableDays} payable days**, ${lates}.` };
        }
        return { period: p.label, say: `**No attendance uploaded for ${p.label}${name ? ` for ${name}` : ""} yet.**` };
      }
      const notable = att.days.filter((d) => (d.late || d.shortDay || d.status === "Absent" || d.status === "Paid Leave") && (d.hasRow || d.status !== "Absent"))
        .map((d) => [md(d.date), [d.status, d.late && "late", d.shortDay && "short"].filter(Boolean).join(" "), d.in ? `${d.in}-${d.out ?? "?"}` : ""]);
      const day = ctx.period?.kind === "day" ? att.days.find((d) => d.date === ctx.period!.from) : null;
      return { period: p.label, ...(name ? { name } : {}), summary: attSummary(att),
        ...(day ? { day: { date: ctx.period!.label, status: day.status, in: day.in, out: day.out, late: !!day.late, short: !!day.shortDay } } : {}),
        ...(notable.length ? { notableDays: table(["date", "status", "time"], notable, 10) } : {}) };
    },
  },
  {
    name: "my_leave", description: "My leave requests and leave taken.", parameters: none,
    run: async (ctx) => {
      const o = await call("leave_overview", { p_token: ctx.token });
      const apps = o.applications as Row[];
      if (!apps.length) return { say: "**You have no leave requests.**" };
      return { takenThisMonth: o.stats?.month, takenThisYear: o.stats?.year,
        list: table(["from", "to", "days", "status", "reason"], apps.map((x) => [md(x.start), md(x.end), x.days, x.status, short(x.reason, 40)]), 8) };
    },
  },
  {
    name: "today_report_status", description: "My reports due today and whether each is filed.", parameters: none,
    run: async (ctx) => {
      const opts = (await call("report_options", { p_token: ctx.token })) as Row[];
      if (!opts.length) return { say: "**You don't have a daily report to file.**" };
      return { period: dayLabel(ctx.today, ctx.today), reports: opts.map((o) => ({ report: o.title, filed: !!o.todayReportId })) };
    },
  },
  // ---- HR / Admin ----
  {
    name: "team_summary", managers: true, description: "Team report numbers for the period, per report and person.", parameters: none,
    run: async (ctx) => {
      const p = ctx.period ?? todayPeriod(ctx.today);
      const date = p.kind === "day" ? p.from : (p.to > ctx.today ? ctx.today : p.to);
      const groups = (await call("team_report_summary", { p_token: ctx.token, p_date: date, p_type: null, p_project: null, p_employee_id: null })) as Row[];
      const useMonth = p.kind !== "day";
      const nums = (t: Row) => [t.leads, t.calls, t.done, t.tokens];
      const out = groups.map((g) => {
        const people = (g.rows as Row[]).map((r) => [r.employeeName, ...(useMonth ? [] : [r.filedToday ? 1 : r.off ?? 0]), ...nums((useMonth ? r.mtd : r.today) as Row)]);
        const live = people.filter((r) => r.slice(useMonth ? 1 : 2).some((v) => Number(v)));
        return { report: g.title, totals: nums(((g.totals as Row)[useMonth ? "mtd" : "today"]) as Row), people: live.length ? table(["name", ...(useMonth ? [] : ["filed"]), "leads", "calls", "visits done", "tokens"], live, 8) : undefined };
      }).filter((g) => (g.totals as unknown[]).some((v) => Number(v)));
      const label = useMonth ? `${p.label}${p.to > ctx.today ? " (so far)" : ""}` : p.label;
      if (!out.length) return { period: label, say: `**No reports filed ${p.kind === "day" ? (p.from === ctx.today ? `yet today (${p.label.replace("today, ", "")})` : `on ${p.label}`) : `in ${label}`}.**` };
      return { period: label, cols: ["leads", "calls", "visits done", "tokens"], groups: out };
    },
  },
  {
    name: "not_filed_today", managers: true, description: "Who hasn't filed today's report; who is off today.", parameters: none,
    run: async (ctx) => {
      const r = (await call("assist_not_filed", { p_token: ctx.token })) as { notFiled: Row[]; off: Row[] };
      const label = dayLabel(ctx.today, ctx.today).replace("today, ", "");
      if (!r.notFiled.length) return { period: `today, ${label}`, say: `**Everyone has filed today (${label}).**` };
      return { period: `today, ${label}`, count: r.notFiled.length, notFiled: r.notFiled.slice(0, MAX_ROWS).map((x) => `${x.name} (${(x.missing as string[]).join(", ")})`),
        ...(r.off.length ? { off: r.off.slice(0, 8).map((x) => `${x.name}: ${x.off}`) } : {}) };
    },
  },
  {
    name: "attendance_checks", managers: true, description: "How many checked their updated attendance for the period's month.", parameters: none,
    run: async (ctx) => {
      const p = monthPeriodOf(ctx);
      const rows = (await call("att_checks", { p_token: ctx.token, p_month: `${p.month}-01` })) as Row[];
      if (!rows.length) return { period: p.label, say: `**No attendance updates to check for ${p.label}.**` };
      const not = rows.filter((r) => !r.checkedAt).map((r) => (r.employee as Row)?.name);
      return { period: p.label, checked: rows.length - not.length, total: rows.length, notChecked: not.slice(0, 10), ...(not.length > 10 ? { more: not.length - 10 } : {}) };
    },
  },
  {
    name: "pending_leave", managers: true, description: "Leave requests waiting for a decision.", parameters: none,
    run: async (ctx) => {
      const q = (await call("leave_queue", { p_token: ctx.token, p_status: "Pending" })) as Row[];
      if (!q.length) return { say: "**No pending requests.**" };
      return { count: q.length, list: table(["name", "from", "to", "days", "reason", "warning"], q.map((x) => [
        (x.employee as Row)?.name, md(x.start), md(x.end), x.days, short(x.reason, 40), short((x.warnings as string[] | undefined)?.[0], 50) ?? "",
      ]), 8) };
    },
  },
];

const person = { type: "string", description: "name or ID; omit for me" };

/** The tools this role may use. HR/Admin's reports + attendance take a person (name or ID). */
// Only about the person's own filed reports (managing the team's doesn't count).
const OWN_REPORT_TOOLS = new Set(["my_visits", "today_report_status"]);
export const toolsFor = (role: Role, perms: Perms): Tool[] => TOOLS.filter((t) =>
  (!t.managers || isManager(role)) && areasOf(role, perms)[AREA[t.name]] && (!OWN_REPORT_TOOLS.has(t.name) || filesReports(perms))).map((t) => ({
  name: t.name, description: t.description,
  parameters: isManager(role) && (t.name === "reports" || t.name === "attendance") ? { type: "object", properties: { person } } : t.parameters,
}));

/** Runs one tool for this person, or explains why not. Never throws. */
export async function runTool(role: Role, perms: Perms, ctx: Ctx, name: string, rawArgs: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || (tool.managers && !isManager(role))) return NOT_YOURS;
  // Checked again here: a tool the person's permissions don't allow never runs.
  if (!areasOf(role, perms)[AREA[tool.name]]) return { final: noAccess(AREA[tool.name], role, perms) };
  if (OWN_REPORT_TOOLS.has(tool.name) && !filesReports(perms)) return { final: NO_OWN_REPORTS };
  let args: Record<string, string | undefined> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { error: "Bad tool arguments." }; }
  if (args.employee_id && !args.person) args.person = args.employee_id;
  try {
    return await tool.run(ctx, args, role);
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 120) : "Couldn't load that." };
  }
}
