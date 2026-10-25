import * as XLSX from "xlsx";

/**
 * Turns an uploaded attendance file into rows for att_import (supabase/attendance.sql).
 * Three formats, detected automatically:
 *  - "etimeoffice": the eTimeOffice "Month IN/OUT Report" (.xls/.xlsx) as downloaded:
 *    one block per employee ("Empcode 0002 … Name …"), then Date | Shift | IN | … | Out.
 *  - "template":    Date | Employee Code | In Time | Out Time | Paid Leave | Remark.
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
    }));
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
