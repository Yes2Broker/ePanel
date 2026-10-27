/**
 * Works out which period a question is about, on the server, so the model
 * never picks a year. "Sep" on 27 Oct 2026 = September 2026 (the most recent
 * September not in the future); also "this/last month", "today", "yesterday",
 * "last/this week", "24 Sep", "24/09", and Hinglish ("is mahine", "aaj").
 * The latest user message that names a period wins; otherwise none (tools
 * then use this month / today).
 */
export interface Period { kind: "month" | "day" | "range"; from: string; to: string; month: string; label: string }

const MONTHS: string[][] = [
  ["jan", "january", "janvari", "janwari"], ["feb", "february", "farvari", "farwari"], ["mar", "march", "maarch"], ["apr", "april", "aprail"],
  ["may"], ["jun", "june", "joon"], ["jul", "july", "julai"], ["aug", "august", "agast"], ["sep", "sept", "september", "sitambar", "sitamber", "setambar"],
  ["oct", "october", "aktubar", "oktobar", "aktoober"], ["nov", "november", "navambar", "november"], ["dec", "december", "disambar", "december"],
];
const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = NAMES.map((n) => n.slice(0, 3));

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { y, m: m - 1, d }; };
const addDays = (s: string, n: number) => { const t = new Date(`${s}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monthIndex = (w: string) => MONTHS.findIndex((names) => names.includes(w));

export const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${NAMES[m - 1]} ${y}`; };
export function dayLabel(date: string, today: string) {
  const { y, m, d } = parse(date);
  const base = `${d} ${SHORT[m]}${y !== parse(today).y ? ` ${y}` : ""}`;
  if (date === today) return `today, ${base}`;
  if (date === addDays(today, -1)) return `yesterday, ${base}`;
  const wd = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${wd}, ${base}`;
}

/** "19–25 Oct", "28 Sep – 4 Oct" */
const span = (from: string, to: string, today: string) => {
  const a = dayLabel(from, today).replace(/^[^,]+, /, ""), b = dayLabel(to, today).replace(/^[^,]+, /, "");
  const [ad, ...am] = a.split(" ");
  return am.join(" ") === b.split(" ").slice(1).join(" ") ? `${ad}–${b}` : `${a} – ${b}`;
};
const monthPeriod = (y: number, m: number): Period => ({ kind: "month", from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), month: iso(y, m, 1).slice(0, 7), label: monthLabel(iso(y, m, 1).slice(0, 7)) });
const dayPeriod = (date: string, today: string): Period => ({ kind: "day", from: date, to: date, month: date.slice(0, 7), label: dayLabel(date, today) });

/** Most recent (month[, day]) not after today, unless a year was given. */
function recent(today: string, m: number, d: number | null, year?: number) {
  const t = parse(today);
  if (year) return { y: year, m };
  const future = m > t.m || (m === t.m && d != null && d > t.d);
  return { y: future ? t.y - 1 : t.y, m };
}

export function resolveOne(text: string, today: string): Period | null {
  const s = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const t = parse(today);
  let x: RegExpMatchArray | null;
  if ((x = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return dayPeriod(`${x[1]}-${x[2]}-${x[3]}`, today);
  // "24 sep", "24th of september 2025"
  for (const mm of Array.from(s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?(?:\s+(20\d\d))?\b/g))) {
    const m = monthIndex(mm[2]);
    if (m >= 0 && Number(mm[1]) >= 1 && Number(mm[1]) <= 31) { const r = recent(today, m, Number(mm[1]), mm[3] ? Number(mm[3]) : undefined); return dayPeriod(iso(r.y, r.m, Math.min(Number(mm[1]), lastDay(r.y, r.m))), today); }
  }
  // "sep 24", "september 24, 2025"
  for (const mm of Array.from(s.matchAll(/\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(20\d\d))?/g))) {
    const m = monthIndex(mm[1]);
    if (m >= 0 && Number(mm[2]) >= 1 && Number(mm[2]) <= 31) { const r = recent(today, m, Number(mm[2]), mm[3] ? Number(mm[3]) : undefined); return dayPeriod(iso(r.y, r.m, Math.min(Number(mm[2]), lastDay(r.y, r.m))), today); }
  }
  // "24/09", "24-9-2026"
  if ((x = s.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](20\d\d))?\b(?!\s*(?:day|din))/)) &&Number(x[2]) >= 1 && Number(x[2]) <= 12) {
    const r = recent(today, Number(x[2]) - 1, Number(x[1]), x[3] ? Number(x[3]) : undefined);
    return dayPeriod(iso(r.y, r.m, Math.min(Number(x[1]), lastDay(r.y, r.m))), today);
  }
  if (/\b(today|today's|todays|aaj|aj|aaje)\b/.test(s)) return dayPeriod(today, today);
  if (/\b(yesterday|yesterday's|kal raat)\b/.test(s)) return dayPeriod(addDays(today, -1), today);
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  if (/\b(last|previous|pichle|pichhle|pichla)\s+(week|hafte|hafta)\b/.test(s)) {
    const from = addDays(monday, -7), to = addDays(monday, -1);
    return { kind: "range", from, to, month: from.slice(0, 7), label: `last week (${span(from, to, today)})` };
  }
  if (/\b(this|current|is)\s+(week|hafte|hafta)\b/.test(s)) return { kind: "range", from: monday, to: today, month: monday.slice(0, 7), label: `this week (${span(monday, today, today)})` };
  if (/\b(last|previous|pichle|pichhle|pichla)\s+(month|mahine|mahina)\b/.test(s)) return monthPeriod(t.m === 0 ? t.y - 1 : t.y, (t.m + 11) % 12);
  if (/\b(this|current|is)\s+(month|mahine|mahina|maheene)\b/.test(s)) return monthPeriod(t.y, t.m);
  // A month name on its own ("Sep", "september 2025"). "may" only when it clearly means the month.
  const words = s.trim().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const m = monthIndex(words[i]);
    if (m < 0) continue;
    const year = /^20\d\d$/.test(words[i + 1] ?? "") ? Number(words[i + 1]) : undefined;
    if (words[i] === "may" && !year && words.length > 3) continue;
    const r = recent(today, m, null, year);
    return monthPeriod(r.y, r.m);
  }
  return null;
}

/** The period of the latest user message that names one (searching back through the chat). */
export function resolvePeriod(userMessages: string[], today: string): Period | null {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const p = resolveOne(userMessages[i], today);
    if (p) return p;
  }
  return null;
}

export const thisMonth = (today: string) => { const t = parse(today); return monthPeriod(t.y, t.m); };
export const todayPeriod = (today: string) => dayPeriod(today, today);
export const prevMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
