import { SalesReportDetail } from "@/types";
import { OFFICE_TZ } from "@/lib/utils";

const utcDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** "24 Oct 26" — the popup's column header and visit dates (old form style). */
export function shortDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return utcDate(iso).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "2-digit" });
}

/** "Sat 24 Oct 2026" — the date line in the form and WhatsApp text. */
export function longDate(iso: string) {
  return utcDate(iso).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

/** "14:30" -> "02:30 PM". Anything else (e.g. imported text) is shown as it is. */
export function time12(t: string | null | undefined) {
  if (!t) return "-";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, "0")}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Current time in office time as "HH:MM" (for "not in the future" checks). */
export function nowHHMM() {
  return new Date().toLocaleTimeString("en-GB", { timeZone: OFFICE_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function visitStatusLabel(v: { status: string; rescheduleDate: string | null }) {
  if (v.status === "Pending" && v.rescheduleDate) return `Rescheduled to ${shortDate(v.rescheduleDate)}`;
  return v.status;
}

/** The text sent to WhatsApp — same layout as the old forms. */
export function whatsappText(r: SalesReportDetail) {
  const sole = r.type === "Sole Selling";
  const done = r.doneVisits.length ? r.doneVisits.map((v) => `• ${v.client} (${time12(v.time)})`).join("\n") : "-";
  const sched = r.scheduledDetails.length ? r.scheduledDetails.map((v) => `• ${v.client}`).join("\n") : "-";
  const lines = [
    sole ? `*Sole Selling Report – ${r.projectName ?? ""}*` : "*Daily Sales Report*",
    `*Date:* ${longDate(r.date)}`,
    `*Name:* ${r.employeeName}`,
    "",
    `*Leads:* ${r.today.leads}`,
    `*Calls:* ${r.today.calls}`,
    `*Positive:* ${r.today.positive}`,
    `*Scheduled Count:* ${r.today.scheduled}`,
    `*Done Count:* ${r.today.done}`,
    ...(sole ? [`*Walk In:* ${r.today.walkIn}`] : []),
    `*Tokens:* ${r.today.tokens}`,
    "",
    "*Visits Done*",
    done,
    ...(sole ? ["", "*Walk Ins*", r.walkIns.length ? r.walkIns.map((w) => `• ${w}`).join("\n") : "-"] : []),
    "",
    "*Visits Scheduled*",
    sched,
  ];
  return lines.join("\n");
}

export function whatsappUrl(r: SalesReportDetail) {
  return "https://wa.me/?text=" + encodeURIComponent(whatsappText(r));
}
