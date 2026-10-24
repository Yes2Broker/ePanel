import { LeaveType, ModuleKey } from "@/types";

export const DEPARTMENTS = ["Sales", "Tech", "HR", "Admin", "Management"] as const;
export const ROLES = ["Employee", "HR", "Admin"] as const;
export const LEAVE_TYPES: LeaveType[] = ["Casual", "Sick", "Earned", "Unpaid"];
// ISO weekday numbers, as stored in employees.week_off.
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function weekOffLabel(weekOff: number | null) {
  return weekOff ? WEEKDAYS[weekOff - 1] : "None";
}

export const ATTENDANCE_STATUSES = ["Present", "Late", "Half Day", "Absent", "Leave"] as const;

export const MODULES: { key: ModuleKey; label: string; comingSoon?: boolean }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "tasks", label: "My Tasks" },
  { key: "normalReport", label: "Normal Daily Report" },
  { key: "soleSelling", label: "Sole Selling Daily Report" },
  { key: "builderData", label: "Builder Data", comingSoon: true },
  { key: "inquiryForm", label: "Inquiry Form", comingSoon: true },
  { key: "analytics", label: "Analytics", comingSoon: true },
];
