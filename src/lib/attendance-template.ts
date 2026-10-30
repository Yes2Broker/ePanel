import * as XLSX from "xlsx-js-style";
import type { Employee } from "@/types";

/**
 * The pre-filled monthly attendance template (Attendance → Upload → Download template):
 * one row per active employee (no Admin) per day of the month, from their joining
 * date. HR only types In / Out (and Paid Leave). The upload reads it by header
 * name (attendance-parse.ts, "template"), so Day and Name are just for reading.
 */
const BLUE = "273992", YELLOW = "FFF8DC", WHITE = "FFFFFF";
const HEAD = ["Date", "Day", "Employee Code", "Name", "In Time", "Out Time", "Paid Leave", "Remark"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Sales first, then the other departments A–Z; then employee code (EMP002 before EMP010). */
function order(a: Employee, b: Employee) {
  const d = (e: Employee) => (e.department === "Sales" ? "" : e.department);
  return d(a).localeCompare(d(b)) || a.id.localeCompare(b.id, undefined, { numeric: true });
}

export function buildAttendanceTemplate(employees: Employee[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(last).padStart(2, "0")}`;
  const people = employees.filter((e) => e.status === "Active" && e.role !== "Admin" && (!e.joiningDate || e.joiningDate <= monthEnd)).sort(order);

  const ws: XLSX.WorkSheet = {};
  const put = (r: number, c: number, v: string, s: Record<string, unknown>) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v, z: "@", s }; };
  const border = { top: { style: "thin", color: { rgb: "D9D9D9" } }, bottom: { style: "thin", color: { rgb: "D9D9D9" } }, left: { style: "thin", color: { rgb: "D9D9D9" } }, right: { style: "thin", color: { rgb: "D9D9D9" } } };
  HEAD.forEach((h, c) => put(0, c, h, { font: { bold: true, color: { rgb: WHITE } }, fill: { fgColor: { rgb: BLUE } }, alignment: { vertical: "center" }, border }));

  let r = 1;
  people.forEach((e, i) => {
    if (i > 0) r++; // one blank row between people
    const from = e.joiningDate && e.joiningDate.slice(0, 7) === month ? Number(e.joiningDate.slice(8, 10)) : 1;
    for (let d = from; d <= last; d++, r++) {
      const lastRow = d === last;
      const b = lastRow ? { ...border, bottom: { style: "medium", color: { rgb: BLUE } } } : border;
      const plain = { border: b }, fill = { border: b, fill: { fgColor: { rgb: YELLOW } } };
      const dd = String(d).padStart(2, "0");
      put(r, 0, `${dd}/${String(m).padStart(2, "0")}/${y}`, plain);
      put(r, 1, DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], plain);
      put(r, 2, e.id, plain);
      put(r, 3, e.name, plain);
      for (let c = 4; c <= 7; c++) put(r, c, "", fill);
    }
  });
  const lastRow = Math.max(r - 1, 1);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 7 } });
  ws["!cols"] = [12, 6, 15, 24, 10, 10, 11, 28].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 7 } }) };

  const help = XLSX.utils.aoa_to_sheet([
    ["How to fill this attendance sheet"], [""],
    ["1. Type only In Time and Out Time, in 24-hour HH:MM (for example 09:55 and 19:05)."],
    ["2. Leave both empty if the person was absent that day."],
    ["3. Weekly offs can stay empty."],
    ["4. Paid leave: choose Yes in Paid Leave and write the reason in Remark."],
    ["5. Don't change the dates, employee codes, names or the order of the rows."],
    ["6. Save the file and upload it in Attendance → Upload."],
  ]);
  help["A1"].s = { font: { bold: true, sz: 13, color: { rgb: BLUE } } };
  help["!cols"] = [{ wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.utils.book_append_sheet(wb, help, "How to fill");
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { data: addFreezeAndDropdown(new Uint8Array(data), lastRow + 1), name: `Y2B_Attendance_${MONTHS[m - 1]}-${y}.xlsx`, people: people.length };
}

/**
 * SheetJS can't write frozen panes or dropdowns, so they're added to the first
 * sheet's XML: header row frozen, and a "Yes" list on Paid Leave (G2:G…).
 */
function addFreezeAndDropdown(file: Uint8Array, rows: number) {
  const CFB = XLSX.CFB;
  const zip = CFB.read(file, { type: "array" });
  const path = "/xl/worksheets/sheet1.xml";
  const entry = CFB.find(zip, path);
  if (!entry || !entry.content) return new Uint8Array(file);
  let xml = new TextDecoder().decode(entry.content as Uint8Array);
  const view = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="E2" sqref="E2"/></sheetView></sheetViews>';
  xml = /<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml) ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view)
    : xml.replace(/(<dimension[^>]*\/>)/, `$1${view}`);
  const dv = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="G2:G${rows}"><formula1>"Yes"</formula1></dataValidation></dataValidations>`;
  const at = xml.search(/<(hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|drawing|legacyDrawing|tableParts|extLst)\b|<\/worksheet>/);
  xml = xml.slice(0, at) + dv + xml.slice(at);
  CFB.utils.cfb_add(zip, path, new TextEncoder().encode(xml));
  return new Uint8Array(CFB.write(zip, { type: "array", fileType: "zip" }) as ArrayLike<number>);
}
