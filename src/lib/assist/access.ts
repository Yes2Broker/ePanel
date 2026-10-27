/**
 * What each person may use in Y2B Assist, from their Permissions page switches:
 * Daily Reports (normal or sole selling, incl. site visits), Attendance, Leave.
 * Shared by the server (tools, fixed replies) and the panel (suggestions).
 */
/** The person's Permissions page switches (from get_me). */
export type Perms = Partial<Record<"attendance" | "normalReport" | "soleSelling" | "leave" | "builderData", boolean>>;
export type Area = "reports" | "attendance" | "leave";
/** Which areas this person has: Daily Reports (+ visits), Attendance, Leave. */
export const areasOf = (p: Perms) => ({ reports: !!(p.normalReport || p.soleSelling), attendance: !!p.attendance, leave: !!p.leave });
const AREA_WORDS: Record<Area, string> = { reports: "your reports and visits", attendance: "your attendance", leave: "leave" };
/** What they can ask instead, e.g. "You can ask about your attendance or leave." */
export function canAsk(p: Perms) {
  const a = areasOf(p), list = (Object.keys(a) as Area[]).filter((k) => a[k]).map((k) => AREA_WORDS[k]);
  if (!list.length) return "";
  return `You can ask about ${list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0]}.`;
}
/** The one line for a missing area. */
export function noAccess(area: Area, p: Perms) {
  const line = area === "reports" ? "You don't have Daily Reports or site visits in your panel. Ask HR if you need them."
    : area === "leave" ? "Leave isn't turned on for you. Ask HR or Admin." : "Attendance isn't turned on for you.";
  const alt = canAsk(p);
  return alt ? `${line}\n${alt}` : line;
}
export const OWN_ONLY = "You can only see your own data in Y2B Assist.";

const ASK_WORDS: Record<Area, string> = { reports: "reports, visits", attendance: "attendance", leave: "leave" };
/** "What do you need: attendance or leave?" — only what they have. */
export function askLine(p: Perms) {
  const a = areasOf(p), list = (Object.keys(a) as Area[]).filter((k) => a[k]).map((k) => ASK_WORDS[k]);
  if (!list.length) return "Nothing is turned on for you in Y2B Assist yet. Ask HR or Admin.";
  return `What do you need: ${list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0]}?`;
}
