import * as XLSX from "xlsx";

/**
 * Turns an uploaded attendance file into rows for att_import (supabase/attendance.sql).
 * Three formats, detected automatically:
 *  - "etimeoffice": the eTimeOffice "Month IN/OUT Report" (.xls/.xlsx) as downloaded:
 *    one block per employee ("Empcode 0002 … Name …"), then Date | Shift | IN | … | Out.
 *  - "template":    Date | Employee Code | In Time | Out Time | Paid Leave | Remark, read by
 *    header name (the pre-filled monthly template adds Day and Name, which are ignored).
 *  - "history":     the old Google Sheet "Attendance" tab (CSV) or the monthly workbook
 *    with one sheet per employee: Date | Employee Code "Name (Y2B_E07)" | In | Out |
 *    Working Hours | Late | Half Day | Status | Remark.
 * Dates and times are read from the raw cell values (Excel serial numbers or text),
 * never through JavaScript Date objects, so time zones can't shift them.
 */

export type AttendanceKind = "etimeoffice" | "template" | "history";

export interface AttendanceRow {
  code: string;
  name?: string;
  date: string; // YYYY-MM-DD ("" if unreadable: the server reports it)
  in: string; // HH:MM or ""
  out: string;
  paid?: boolean;
  remark?: string;
  status?: string;
  sheetLate?: string;
  sheetHalf?: string;
}

interface ParsedAttendance {
  kind: AttendanceKind;
  rows: AttendanceRow[];
  sheets: number;
}

type Cell = string | number | boolean | null;

const text = (v: Cell) => (v == null ? "" : String(v).trim());

/** Excel serial (days since 1899-12-30) → YYYY-MM-DD. */
function serialDate(n: number) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** "01/10/2026", "1/10/2026", "2026-10-01", or an Excel serial → "2026-10-01". */
function parseDate(v: Cell): string {
  if (typeof v === "number" && v > 20000) return serialDate(v);
  const s = text(v);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}

/** "10:24", "9:05", "10:24:00", "7:01 PM", Excel time fraction → "HH:MM"; "--:--"/blank → "". */
function parseTime(v: Cell): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  const s = text(v).toUpperCase();
  if (!s || /^-+:?-*$/.test(s)) return "";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/.exec(s);
  if (!m) return s; // let the server report it
  let h = Number(m[1]);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const rowsOf = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
const norm = (s: Cell) => text(s).toLowerCase().replace(/\s+/g, " ");

function findHeader(rows: Cell[][], must: string[]) {
  return rows.findIndex((r) => must.every((m) => r.some((c) => norm(c) === m)));
}

/** eTimeOffice Month IN/OUT report. */
function parseETimeOffice(wb: XLSX.WorkBook): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name]);
    let code = "", person = "";
    let inIdx = -1, outIdx = -1;
    for (const r of rows) {
      const first = norm(r[0]);
      if (first === "empcode") {
        code = text(r.slice(1).find((c) => text(c) !== "") ?? null);
        const ni = r.findIndex((c) => norm(c) === "name");
        person = ni >= 0 ? text(r.slice(ni + 1).find((c) => text(c) !== "") ?? null) : "";
        inIdx = outIdx = -1;
        continue;
      }
      if (first === "date" && r.some((c) => norm(c) === "in")) {
        inIdx = r.findIndex((c) => norm(c) === "in");
        outIdx = r.reduce<number>((last, c, i) => (norm(c) === "out" ? i : last), -1);
        continue;
      }
      if (!code || inIdx < 0) continue;
      const date = parseDate(r[0]);
      if (!date) continue; // totals rows etc.
      const punchIn = parseTime(r[inIdx]);
      // The final "Out" column; if it's empty, the last punch after IN.
      let punchOut = outIdx >= 0 ? parseTime(r[outIdx]) : "";
      if (!punchOut) {
        for (let i = (outIdx > 0 ? outIdx : r.length) - 1; i > inIdx; i--) {
          const t = parseTime(r[i]);
          if (t) { punchOut = t; break; }
        }
      }
      out.push({ code, name: person, date, in: punchIn, out: punchOut });
    }
  }
  return out;
}

/** Our simple upload template. */
function parseTemplate(wb: XLSX.WorkBook): AttendanceRow[] {
  const ws = wb.Sheets[wb.SheetNames.find((n) => findHeader(rowsOf(wb.Sheets[n]), ["employee code", "paid leave"]) >= 0) ?? wb.SheetNames[0]];
  const rows = rowsOf(ws);
  const h = findHeader(rows, ["employee code", "paid leave"]);
  const col = (n: string) => rows[h].findIndex((c) => norm(c) === n);
  const [cDate, cCode, cIn, cOut, cPaid, cRemark] = ["date", "employee code", "in time", "out time", "paid leave", "remark"].map(col);
  return rows.slice(h + 1)
    .filter((r) => text(r[cDate]) || text(r[cCode]))
    .map((r) => ({
      code: text(r[cCode]).toUpperCase(),
      date: parseDate(r[cDate]),
      in: parseTime(r[cIn]),
      out: parseTime(r[cOut]),
      paid: /^y(es)?$/i.test(text(r[cPaid])),
      remark: cRemark >= 0 ? text(r[cRemark]) : "",
    }))
    // A pre-filled day left empty is the same as no row (Absent, or Weekoff on their weekly off).
    .filter((r) => r.in || r.out || r.paid || r.remark);
}

/** Old Google Sheet history (CSV) or the monthly workbook, one sheet per person. */
function parseHistory(wb: XLSX.WorkBook): AttendanceRow[] {
  const out: AttendanceRow[] = [];
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name]);
    const h = findHeader(rows, ["employee code", "status"]);
    if (h < 0) continue;
    const col = (n: string) => rows[h].findIndex((c) => norm(c) === n);
    const [cDate, cCode, cIn, cOut, cLate, cHalf, cStatus, cRemark] =
      ["date", "employee code", "in time", "out time", "late", "half day", "status", "remark"].map(col);
    for (const r of rows.slice(h + 1)) {
      const who = text(r[cCode]);
      if (!who && !text(r[cDate])) continue;
      const m = /\((Y2B_E\d+|EMP\d+)\)\s*$/i.exec(who);
      out.push({
        code: m ? m[1].toUpperCase() : who,
        name: who.replace(/\s*\([^)]*\)\s*$/, ""),
        date: parseDate(r[cDate]),
        in: parseTime(r[cIn]),
        out: parseTime(r[cOut]),
        status: cStatus >= 0 ? text(r[cStatus]) : "",
        remark: cRemark >= 0 ? text(r[cRemark]) : "",
        sheetLate: cLate >= 0 ? text(r[cLate]) : "",
        sheetHalf: cHalf >= 0 ? text(r[cHalf]) : "",
      });
    }
  }
  return out;
}

export async function parseAttendanceFile(file: File): Promise<ParsedAttendance> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  // CSV is read as plain text so "01/02/2026" stays DD/MM/YYYY (never guessed as a US date).
  const wb = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
  const all = wb.SheetNames.map((n) => rowsOf(wb.Sheets[n]));
  const has = (pred: (r: Cell[]) => boolean) => all.some((rows) => rows.some(pred));

  if (has((r) => norm(r[0]) === "empcode")) {
    return { kind: "etimeoffice", rows: parseETimeOffice(wb), sheets: wb.SheetNames.length };
  }
  if (all.some((rows) => findHeader(rows, ["employee code", "paid leave"]) >= 0)) {
    return { kind: "template", rows: parseTemplate(wb), sheets: 1 };
  }
  if (all.some((rows) => findHeader(rows, ["employee code", "status"]) >= 0)) {
    return { kind: "history", rows: parseHistory(wb), sheets: wb.SheetNames.length };
  }
  throw new Error("This file doesn't look like the eTimeOffice Month IN/OUT report, our template, or the old attendance sheet.");
}

export interface ETimeOfficeReport {
  month: string | null; // YYYY-MM from "Report Month" (null if not found)
  people: { code: string; name: string; days: Record<string, { in: string; out: string }> }[];
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "October 2026", "Oct-2026", "10/2026", "01/10/2026 To 31/10/2026" → "2026-10". */
function parseMonth(s: string): string | null {
  const t = s.toLowerCase();
  let m = /([a-z]{3,})[a-z]*[\s,-]*(\d{4})/.exec(t);
  if (m && MONTH_NAMES.indexOf(m[1].slice(0, 3)) >= 0) return `${m[2]}-${String(MONTH_NAMES.indexOf(m[1].slice(0, 3)) + 1).padStart(2, "0")}`;
  m = /\b\d{1,2}[/.-](\d{1,2})[/.-](\d{4})\b/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /\b(\d{1,2})[/.-](\d{4})\b/.exec(t);
  return m ? `${m[2]}-${m[1].padStart(2, "0")}` : null;
}

/**
 * The eTimeOffice "Month IN/OUT" report read strictly, for "Fill from eTimeOffice":
 * one entry per employee block (Empcode + Name), IN from the "IN" column and OUT
 * from the LAST "Out" column only ("--:--"/blank = no time), plus the Report Month.
 */
export async function readETimeOfficeReport(file: File): Promise<ETimeOfficeReport> {
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
  let month: string | null = null;
  const people: ETimeOfficeReport["people"] = [];
  for (const sheet of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[sheet]);
    let cur: ETimeOfficeReport["people"][number] | null = null, inIdx = -1, outIdx = -1;
    for (const r of rows) {
      if (!month) {
        const i = r.findIndex((c) => /report\s*month/i.test(text(c)));
        if (i >= 0) month = parseMonth([text(r[i]).replace(/report\s*month\s*:?/i, ""), ...r.slice(i + 1).map(text)].join(" "));
      }
      if (norm(r[0]) === "empcode") {
        const ni = r.findIndex((c) => norm(c) === "name");
        cur = { code: text(r.slice(1, ni >= 0 ? ni : undefined).find((c) => text(c) !== "") ?? null), name: ni >= 0 ? text(r.slice(ni + 1).find((c) => text(c) !== "") ?? null) : "", days: {} };
        people.push(cur);
        inIdx = outIdx = -1;
        continue;
      }
      if (norm(r[0]) === "date" && r.some((c) => norm(c) === "in")) {
        inIdx = r.findIndex((c) => norm(c) === "in");
        outIdx = r.reduce<number>((last, c, i) => (norm(c) === "out" ? i : last), -1);
        continue;
      }
      if (!cur || inIdx < 0) continue;
      const date = parseDate(r[0]);
      if (!date) continue;
      const tin = parseTime(r[inIdx]), tout = outIdx >= 0 ? parseTime(r[outIdx]) : "";
      if (tin || tout) cur.days[date] = { in: tin, out: tout };
    }
  }
  if (!people.length) throw new Error("This doesn't look like the eTimeOffice \"Month IN/OUT\" report (no Empcode blocks found).");
  return { month, people };
}
