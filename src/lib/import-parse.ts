/**
 * Parsing helpers for importing the old Google-Sheets reports (CSV export).
 * Runs in the browser; nothing here is sent anywhere until the Admin confirms.
 */

/** RFC-4180-ish CSV parser (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type DateOrder = "DMY" | "MDY";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Sheet date -> "YYYY-MM-DD", or null if it can't be read. */
export function parseSheetDate(raw: string, order: DateOrder): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v);
  if (m) return order === "DMY" ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  m = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2,4})/.exec(v);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = /^(?:[A-Za-z]{3},?\s+)?([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/.exec(v);
  if (m && MONTHS.includes(m[1].toLowerCase())) return iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

/** "2:30 PM" / "14:30:00" / "30/12/1899 14:30:00" -> "14:30". Unreadable values are kept as typed. */
export function parseSheetTime(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s*$/.exec(v);
  if (!m) return v;
  let h = +m[1];
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 23 || +m[2] > 59) return v;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function toCount(raw: string | undefined): number {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Small, stable hash for import keys (cyrb53). */
export function hashKey(s: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Edit distance, for suggesting a match for names typed slightly differently. */
export function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
