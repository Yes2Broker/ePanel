import {
  LucideIcon, Sparkles, CalendarCheck, FileText, LayoutGrid, Sun, Users, CalendarRange,
} from "lucide-react";
import { DashboardItem } from "@/types";

/**
 * "Customise dashboard": the sections each dashboard can show, the presets,
 * and how a saved layout is turned into what's on screen. The pages decide
 * which sections a person may see (role, permissions, launched features).
 */

export type DashboardKind = "employee" | "manager";

export const SECTION_LABELS: Record<DashboardKind, Record<string, string>> = {
  employee: {
    attBanner: "Attendance updated banner",
    todayReport: "Today's Report",
    nextLeave: "Next leave",
    payable: "Payable days",
    lates: "Lates",
    short: "Short days",
    monthReports: "This month's reports",
    recentReports: "Recent reports",
  },
  manager: {
    attBanner: "Attendance updated banner",
    employees: "Employees",
    departments: "Departments",
    reportsToday: "Reports today",
    reportsMonth: "Reports this month",
    onLeaveToday: "On leave today",
    pendingLeave: "Pending leave requests",
    teamAttendance: "Today's attendance",
    recentReports: "Recent reports",
    overview: "Employee overview",
  },
};

export interface Preset { id: string; name: string; note: string; icon: LucideIcon; sections: string[] | "all" }

export const PRESETS: Record<DashboardKind, Preset[]> = {
  employee: [
    { id: "simple", name: "Simple", note: "Today's Report and your next leave", icon: Sparkles, sections: ["attBanner", "todayReport", "nextLeave"] },
    { id: "attendance", name: "Attendance focus", note: "Payable days, lates and short days", icon: CalendarCheck, sections: ["attBanner", "payable", "lates", "short"] },
    { id: "reports", name: "Reports focus", note: "Today's Report and this month's numbers", icon: FileText, sections: ["todayReport", "monthReports", "recentReports"] },
    { id: "everything", name: "Everything", note: "Every card you have access to", icon: LayoutGrid, sections: "all" },
  ],
  manager: [
    { id: "today", name: "Today", note: "Attendance, leave requests and today's reports", icon: Sun, sections: ["attBanner", "teamAttendance", "pendingLeave", "reportsToday"] },
    { id: "reports", name: "Team reports", note: "Report numbers and recent reports", icon: Users, sections: ["reportsToday", "reportsMonth", "recentReports", "overview"] },
    { id: "attleave", name: "Attendance & leave", note: "Today's attendance, who's on leave, requests", icon: CalendarRange, sections: ["attBanner", "teamAttendance", "onLeaveToday", "pendingLeave"] },
    { id: "everything", name: "Everything", note: "Every card you have access to", icon: LayoutGrid, sections: "all" },
  ],
};

export const DEFAULT_PRESET = "everything";

/** A preset's layout: its sections first (in the preset's order), the rest hidden after them. */
export function presetLayout(preset: Preset, available: string[]): DashboardItem[] {
  if (preset.sections === "all") return available.map((id) => ({ id, on: true }));
  const shown = preset.sections.filter((id) => available.includes(id));
  return [...shown.map((id) => ({ id, on: true })), ...available.filter((id) => !shown.includes(id)).map((id) => ({ id, on: false }))];
}

/**
 * The layout to show: the saved one limited to what this person may see now,
 * with any section they've gained since added at the end (shown only on
 * "Everything"). Nothing saved = the role default.
 */
export function resolveLayout(kind: DashboardKind, available: string[], saved: { layout: DashboardItem[]; preset: string } | null, fallback?: { layout: DashboardItem[]; preset: string } | null) {
  const base = saved ?? fallback;
  if (!base || !Array.isArray(base.layout)) {
    const preset = PRESETS[kind].find((p) => p.id === DEFAULT_PRESET)!;
    return { layout: presetLayout(preset, available), preset: DEFAULT_PRESET };
  }
  const seen = new Set<string>();
  const layout: DashboardItem[] = [];
  for (const item of base.layout) {
    if (available.includes(item.id) && !seen.has(item.id)) { seen.add(item.id); layout.push({ id: item.id, on: !!item.on }); }
  }
  for (const id of available) if (!seen.has(id)) layout.push({ id, on: base.preset === "everything" });
  return { layout, preset: base.preset };
}
