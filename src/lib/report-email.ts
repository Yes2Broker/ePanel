import nodemailer from "nodemailer";

/**
 * The 10 PM report emails. Layout ported from the old Email.gs: a DAILY, WTD
 * and MTD table per email, team-total tiles and a key. One email for the
 * Normal report and one per active sole selling project.
 */

interface Totals { leads: number; calls: number; positive: number; scheduled: number; done: number; tokens: number; walkIn: number }
interface Group {
  title: string;
  type: "Normal" | "Sole Selling";
  rows: { name: string; daily: Totals; wtd: Totals; mtd: Totals }[];
  totals: { daily: Totals; wtd: Totals; mtd: Totals };
}
export interface EmailPayload { date: string; recipients: string[]; groups: Group[] }

const ACCENT = "#273992";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "Pawan Gelotar" -> "Pawan G." */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

export function dateLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

export function subjectFor(g: Group, date: string) {
  return g.type === "Normal"
    ? `📊 Daily Sales Performance Report — ${dateLabel(date)}`
    : `📊 ${g.title} Report — ${dateLabel(date)}`;
}

function section(g: Group, key: "daily" | "wtd" | "mtd", label: string) {
  const a = ACCENT;
  const thBase = `background:${a};color:#fff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:10px 0;text-align:center;`;
  const thName = `${thBase}text-align:left;padding-left:10px;`;
  const tdBase = "padding:10px 0;font-size:14px;border-bottom:1px solid #ececec;text-align:center;color:#2d3748;white-space:nowrap;";
  const tdName = "padding:10px 0 10px 10px;font-size:13px;border-bottom:1px solid #ececec;text-align:left;font-weight:600;color:#1a202c;word-break:break-word;";
  const cols = ["FL", "CM", "P", "SVS", "SVD", "B"];
  const rows = g.rows.map((r) => {
    const t = r[key];
    return `<tr><td style="${tdName}">${esc(shortName(r.name))}</td>${[t.leads, t.calls, t.positive, t.scheduled, t.done, t.tokens]
      .map((v) => `<td style="${tdBase}">${v}</td>`).join("")}</tr>`;
  }).join("") || `<tr><td colspan="7" style="${tdBase}color:#a0aec0;">No reports</td></tr>`;
  const grand = g.totals[key];
  const tile = (lbl: string, val: string | number) =>
    `<td style="width:25%;padding:4px 2px;vertical-align:top;background:#f8f9ff;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-radius:8px;"><tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${a}44;border-radius:8px;padding:8px 2px 6px;text-align:center;"><div style="font-size:9px;font-weight:800;color:${a};text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px;">${lbl}</div><div style="font-size:17px;font-weight:800;color:#1a202c;line-height:1;">${val}</div></td></tr></table></td>`;
  const tiles1 = `<tr>${tile("FL", grand.leads)}${tile("CM", grand.calls)}${tile("P", grand.positive)}${tile("SVS", grand.scheduled)}</tr>`;
  const tiles2 = `<tr>${tile("SVD", grand.done)}${tile("B", grand.tokens)}${tile("VC%", pct(grand.done, grand.calls))}${tile("CC%", pct(grand.tokens, grand.done))}</tr>`;
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">`
    + `<tr><td colspan="7" bgcolor="${a}" style="background:${a};color:#fff;font-size:14px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:10px;text-align:center;">${label}</td></tr>`
    + `<tr><td bgcolor="${a}" style="${thName}width:26%;">Name</td>${cols.map((h) => `<td bgcolor="${a}" style="${thBase}width:12.4%">${h}</td>`).join("")}</tr>`
    + rows
    + `<tr><td colspan="7" bgcolor="${a}" style="background:${a};color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:5px 8px;">TEAM TOTAL</td></tr>`
    + `<tr><td colspan="7" style="padding:0;"><table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody>${tiles1}${tiles2}</tbody></table></td></tr>`
    + `</table>`;
}

const LEGEND: [string, string][] = [
  ["FL", "Fresh Leads"], ["CM", "Calls Made"], ["P", "Positive Responses"], ["SVS", "Site Visit Scheduled"],
  ["SVD", "Site Visit Done"], ["B", "Bookings / Tokens"], ["VC%", "Visit Conversion (Done ÷ Calls)"],
  ["CC%", "Closure Conversion (Bookings ÷ Done)"], ["WTD", "Week-To-Date (Mon to Today)"], ["MTD", "Month-To-Date (1st to Today)"],
];

export function buildHtml(g: Group, date: string) {
  const heading = g.type === "Normal" ? "📊 Sales Performance Report" : `📊 ${esc(g.title)}`;
  const legend = LEGEND.map(([k, v]) => `<div style="padding:4px 0;font-size:12px;color:#4a5568;border-bottom:1px solid #f0f0f0;"><b style="color:${ACCENT};display:inline-block;min-width:38px;">${k}</b> = ${v}${g.type === "Sole Selling" && k === "SVD" ? " (incl. walk-ins)" : ""}</div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;color:#1a202c;}</style></head><body>`
    + `<div style="max-width:600px;margin:0 auto;">`
    + `<div style="background:${ACCENT};padding:20px 16px 16px;text-align:center;margin-bottom:12px;"><div style="font-size:20px;font-weight:800;color:#fff;">${heading}</div><div style="margin-top:4px;font-size:12px;color:#bfdbfe;">${dateLabel(date)} &nbsp;&middot;&nbsp; Generated at 10:00 PM</div></div>`
    + `<div style="background:#fff;padding:12px 0 16px;">`
    + section(g, "daily", "DAILY") + section(g, "wtd", "WTD") + section(g, "mtd", "MTD")
    + `<div style="padding:12px 14px 4px;border-top:1px solid #e8edf2;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#718096;margin-bottom:8px;">📖 Key</div>${legend}</div>`
    + `<div style="margin-top:14px;text-align:center;font-size:11px;color:#a0aec0;">Automated report &middot; Do not reply to this email.</div>`
    + `</div></div></body></html>`;
}

/** Plain-text copy, sent alongside the HTML so Gmail doesn't collapse the email. */
export function buildText(g: Group, date: string) {
  const lines = [`${g.type === "Normal" ? "Sales Performance Report" : g.title} — ${dateLabel(date)}`, ""];
  for (const [key, label] of [["daily", "DAILY"], ["wtd", "WTD"], ["mtd", "MTD"]] as const) {
    lines.push(`--- ${label} ---`, "Name         | FL  | CM  | P   | SVS | SVD | B");
    for (const r of g.rows) {
      const t = r[key];
      lines.push(`${shortName(r.name).padEnd(12)} | ${[t.leads, t.calls, t.positive, t.scheduled, t.done].map((v) => String(v).padEnd(3)).join(" | ")} | ${t.tokens}`);
    }
    const t = g.totals[key];
    lines.push(`TOTAL        | ${t.leads} | ${t.calls} | ${t.positive} | ${t.scheduled} | ${t.done} | ${t.tokens}`,
      `VC%=${pct(t.done, t.calls)}  CC%=${pct(t.tokens, t.done)}`, "");
  }
  lines.push("FL=Fresh Leads | CM=Calls Made | P=Positive | SVS=Site Visit Scheduled | SVD=Site Visit Done | B=Bookings",
    "VC%=Visit Conversion | CC%=Closure Conversion | WTD=Week-To-Date | MTD=Month-To-Date");
  return lines.join("\n");
}

/** Sends one email per group through Gmail (GMAIL_USER + GMAIL_APP_PASSWORD). */
export async function sendReportEmails(payload: EmailPayload) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Email isn't set up: add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel.");
  if (!payload.recipients.length) throw new Error("No recipients are set (Daily Reports → 10 PM email).");
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } });
  const sent: string[] = [];
  for (const g of payload.groups) {
    const subject = subjectFor(g, payload.date);
    await transport.sendMail({
      from: `"Yes2Broker Reports" <${user}>`,
      to: payload.recipients.join(","),
      subject,
      text: buildText(g, payload.date),
      html: buildHtml(g, payload.date),
    });
    sent.push(subject);
  }
  return sent;
}
