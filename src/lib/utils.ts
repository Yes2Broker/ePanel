import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatINR(value: number) {
  return value ? `₹ ${value.toLocaleString("en-IN")}` : "—";
}

// All dates and times are shown in office time, whatever the viewer's
// device is set to. Keep in sync with private.tz() in supabase/functions.sql.
export const OFFICE_TZ = "Asia/Kolkata";

/** Today's date in office time, as YYYY-MM-DD. */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OFFICE_TZ }).format(new Date());
}

/** Shifts a YYYY-MM-DD date by a number of days. */
export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-23" -> "23 Oct 2026" (or "Fri, 23 Oct" with weekday). */
export function formatDate(iso: string | null | undefined, opts: { weekday?: boolean } = {}) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(opts.weekday ? { weekday: "short" } : { year: "numeric" }),
  });
}

/** ISO timestamp -> "09:58 AM" in office time. */
function formatTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: OFFICE_TZ, hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDateTime(ts: string | null | undefined) {
  if (!ts) return "—";
  return `${formatDate(new Date(ts).toLocaleDateString("en-CA", { timeZone: OFFICE_TZ }))}, ${formatTime(ts)}`;
}

