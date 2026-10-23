import { LeaveType, ModuleKey, ReportStatus, ReportType } from "@/types";

export const DEPARTMENTS = ["Sales", "Tech", "HR", "Admin"] as const;
export const ROLES = ["Employee", "HR", "Admin"] as const;
export const LEAVE_TYPES: LeaveType[] = ["Casual", "Sick", "Earned", "Unpaid"];
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

export const REPORT_MODULE: Record<ReportType, ModuleKey> = {
  Normal: "normalReport",
  "Sole Selling": "soleSelling",
};

export interface ReportField {
  key: string;
  label: string;
  kind: "number" | "text" | "textarea";
  required?: boolean;
  placeholder?: string;
}

/**
 * The questions on each daily report. Answers are stored as JSON, so you can
 * add, remove or rename fields here without touching the database — old
 * reports simply keep the answers they were submitted with.
 */
export const REPORT_FIELDS: Record<ReportType, ReportField[]> = {
  Normal: [
    { key: "callsMade", label: "Calls made", kind: "number", required: true },
    { key: "newLeads", label: "New leads", kind: "number", required: true },
    { key: "followUps", label: "Follow-ups done", kind: "number" },
    { key: "siteVisits", label: "Site visits", kind: "number" },
    { key: "meetings", label: "Client meetings", kind: "number" },
    { key: "bookings", label: "Bookings closed", kind: "number" },
    { key: "summary", label: "Summary of the day", kind: "textarea", required: true, placeholder: "Key conversations, outcomes, blockers…" },
    { key: "plan", label: "Plan for tomorrow", kind: "textarea" },
  ],
  "Sole Selling": [
    { key: "project", label: "Project name", kind: "text", required: true, placeholder: "e.g. Amrut Orchid" },
    { key: "walkIns", label: "Walk-ins", kind: "number", required: true },
    { key: "siteVisits", label: "Site visits", kind: "number", required: true },
    { key: "followUps", label: "Follow-ups done", kind: "number" },
    { key: "bookings", label: "Bookings closed", kind: "number" },
    { key: "inventoryNotes", label: "Inventory / pricing updates", kind: "textarea" },
    { key: "summary", label: "Summary of the day", kind: "textarea", required: true },
  ],
};

/** A rejected report goes back to the employee to fix, so we call it "Sent back". */
export function reportStatusLabel(status: ReportStatus) {
  return status === "Rejected" ? "Sent back" : status;
}
