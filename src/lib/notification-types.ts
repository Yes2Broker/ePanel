import { Employee, Permissions } from "@/types";

/** The notification types a person can get (and turn off in Settings). */
export function notificationTypesFor(user: Employee, permissions: Permissions | null) {
  const canReport = !!(permissions?.normalReport || permissions?.soleSelling);
  const isAdmin = user.role === "Admin";
  const isManager = user.role === "HR" || isAdmin;
  return [
    !isAdmin && { type: "leave_decision", label: "My leave approved or rejected" },
    !isAdmin && { type: "att_updated", label: "My attendance updated" },
    !isAdmin && { type: "att_day", label: "A day of my attendance changed" },
    canReport && !isAdmin && { type: "report_changed", label: "My report edited or deleted" },
    canReport && !isAdmin && { type: "report_reminder", label: "Daily report reminder" },
    canReport && { type: "visit_today", label: "Today's visits" },
    isManager && { type: "leave_request", label: "New leave requests" },
    isManager && { type: "leave_cancelled", label: "Leave cancelled" },
    isManager && { type: "att_checked", label: "Everyone checked their attendance" },
    isAdmin && { type: "email_failed", label: "Daily report email failed" },
  ].filter(Boolean) as { type: string; label: string }[];
}
