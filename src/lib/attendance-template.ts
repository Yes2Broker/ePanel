import type { Employee } from "@/types";

/**
 * The pre-filled monthly attendance template (Attendance → Upload → Download template):
 * one row per active employee (no Admin) per day of the month, from their joining
 * date. HR only types In / Out (and Paid Leave). The upload reads it by header
 * name (attendance-parse.ts, "template"), so Day and Name are just for reading.
 * Built with exceljs (loaded only when downloading): it writes valid dropdowns,
 * frozen panes, filters and text cells that Excel opens cleanly.
 */
const BLUE = "FF273992", YELLOW = "FFFFF8DC", GREY = "FFD9D9D9", ORANGE = "FFFFC48C", RED = "FFC0392B";
const HEAD = ["Date", "Day", "Employee Code", "Name", "In Time", "Out Time", "Paid Leave", "Remark"];
const WIDTHS = [12, 6, 15, 24, 10, 10, 11, 28];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Same order as eTimeOffice: Sales, Tech, HR, then other departments A–Z; then employee code (EMP002 before EMP010). */
const DEPT_ORDER = ["Sales", "Tech", "HR"];
function order(a: Employee, b: Employee) {
  const rank = (e: Employee) => { const i = DEPT_ORDER.indexOf(e.department); return i < 0 ? DEPT_ORDER.length : i; };
  return rank(a) - rank(b) || (rank(a) === DEPT_ORDER.length ? a.department.localeCompare(b.department) : 0)
    || a.id.localeCompare(b.id, undefined, { numeric: true });
}

/** Optional pre-fill ("Fill from eTimeOffice"): times per employee id and date, plus a "Check" sheet. */
export interface TemplateFill {
  times: Record<string, Record<string, { in: string; out: string }>>;
  check: { title: string; rows: { cells: string[]; bad?: boolean }[]; bad?: boolean }[];
}

export async function buildAttendanceTemplate(employees: Employee[], month: string, fill?: TemplateFill) {
  const ExcelJS = (await import("exceljs")).default;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(last).padStart(2, "0")}`;
  const people = employees.filter((e) => e.status === "Active" && e.role !== "Admin" && (!e.joiningDate || e.joiningDate <= monthEnd)).sort(order);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = WIDTHS.map((width) => ({ width, style: { numFmt: "@" } }));
  const thin = { style: "thin" as const, color: { argb: GREY } };
  const head = ws.addRow(HEAD);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.border = { top: thin, bottom: thin, left: thin, right: thin };
  });

  people.forEach((e, i) => {
    if (i > 0) ws.addRow([]); // one blank row between people
    const from = e.joiningDate && e.joiningDate.slice(0, 7) === month ? Number(e.joiningDate.slice(8, 10)) : 1;
    for (let d = from; d <= last; d++) {
      const date = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
      const t = fill?.times[e.id]?.[`${month}-${String(d).padStart(2, "0")}`];
      const row = ws.addRow([date, DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], e.id, e.name, t?.in ?? "", t?.out ?? "", "", ""]);
      const single = !!t && !t.in !== !t.out; // only IN or only OUT: HR must fix it
      const bottom = d === last ? { style: "medium" as const, color: { argb: BLUE } } : thin;
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.numFmt = "@";
        cell.border = { top: thin, left: thin, right: thin, bottom };
        if (c >= 5) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: single && c <= 6 ? ORANGE : YELLOW } };
      }
    }
  });
  // One "Yes" dropdown over the whole Paid Leave column (blank rows included).
  (ws as unknown as { dataValidations: { add: (range: string, v: object) => void } }).dataValidations
    .add(`G2:G${Math.max(ws.rowCount, 2)}`, { type: "list", allowBlank: true, showErrorMessage: true, formulae: ['"Yes"'] });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ws.rowCount, 1), column: 8 } };

  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 90;
  [
    "How to fill this attendance sheet", "",
    "1. Type only In Time and Out Time, in 24-hour HH:MM (for example 09:55 and 19:05).",
    "2. Leave both empty if the person was absent that day.",
    "3. Weekly offs can stay empty.",
    "4. Paid leave: choose Yes in Paid Leave and write the reason in Remark.",
    "5. Don't change the dates, employee codes, names or the order of the rows.",
    "6. Save the file and upload it in Attendance → Upload.",
  ].forEach((t) => help.addRow([t]));
  help.getCell("A1").font = { bold: true, size: 13, color: { argb: BLUE } };

  if (fill) {
    // "Check" sheet: the accuracy checks shown in the panel before download.
    const ck = wb.addWorksheet("Check");
    ck.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 40 }];
    for (const sec of fill.check) {
      const h = ck.addRow([sec.title]);
      h.font = { bold: true, color: { argb: sec.bad ? RED : BLUE } };
      for (const r of sec.rows) {
        const row = ck.addRow(r.cells);
        if (r.bad) row.font = { color: { argb: RED } };
      }
      ck.addRow([]);
    }
  }

  const data = new Uint8Array(await wb.xlsx.writeBuffer());
  return { data, name: `Y2B_Attendance_${MONTHS[m - 1]}-${y}.xlsx`, people: people.length };
}
