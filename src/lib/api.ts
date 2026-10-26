import { supabase } from "@/lib/supabase";
import {
  AdminDashboard, Employee, EmployeeDashboard, ModuleKey, Permissions, DashboardItem, SavedDashboard,
  Project, ReportOption, ReportFormData, ReportPayload,
  AttMonth, AttTeamMonthRow, AttTeamDayRow, AttDay, AttChange, AttImportResult, AttDashboard, PersonRef,
  SalesReportDetail, SalesReportRow, ReportChange, TeamSummaryGroup, SalesReportType,
  LeaveOverview, LeavePreview, LeaveApplication, LeaveDashboard, NotificationList, AttMonthStatus, Payslip, Leaderboard,
} from "@/types";

/**
 * Every call to the database goes through this file. Each function maps
 * 1:1 to a Postgres function in supabase/functions.sql; the session token
 * is attached automatically.
 */

export class ApiError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

let sessionToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

// Read-only calls: identical ones made at the same moment (several parts of a
// page asking for the employee list, say) share one request.
const READS = new Set([
  "list_employees", "get_employee_permissions", "att_month", "att_team_days", "att_salary_sheet", "att_day_changes",
  "att_uploads", "att_dashboard", "att_my_updates", "att_checks", "list_projects", "get_employee_projects", "report_options", "report_form", "get_report",
  "report_history", "my_sales_reports", "list_sales_reports", "team_report_summary", "get_report_email_recipients",
  "list_employee_aliases", "leave_overview", "leave_preview", "leave_timeline", "leave_attachment",
  "leave_queue", "leave_dashboard", "employee_dashboard", "admin_dashboard", "notifications_list", "notification_prefs_get",
  "get_report_reminders", "get_report_reminder_time", "att_month_status", "my_payslips", "my_payslip", "get_visit_reminder",
  "report_leaderboard",
]);
const pending = new Map<string, Promise<unknown>>();

function rpc<T>(fn: string, args: Record<string, unknown> = {}, withToken = true): Promise<T> {
  if (!READS.has(fn)) return call<T>(fn, args, withToken);
  const key = `${sessionToken}|${fn}|${JSON.stringify(args)}`;
  let p = pending.get(key) as Promise<T> | undefined;
  if (!p) {
    p = call<T>(fn, args, withToken);
    pending.set(key, p);
    p.finally(() => pending.delete(key)).catch(() => {});
  }
  return p;
}

// Actions that may notify someone: right after one, ask the server to send
// the pushes at once (the every-30-minute cron is only the backup).
const NOTIFIES = new Set([
  "leave_apply", "leave_decide", "leave_cancel", "att_set_day", "att_import", "att_delete_upload", "att_mark_checked",
  "save_sales_report", "delete_sales_report", "notify_test", "publish_payslips",
]);

function sendPushesNow() {
  fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: sessionToken }), keepalive: true })
    .catch(() => {});
  window.dispatchEvent(new Event("notifications-changed"));
}

async function call<T>(fn: string, args: Record<string, unknown>, withToken: boolean): Promise<T> {
  const { data, error } = await supabase.rpc(fn, withToken ? { p_token: sessionToken, ...args } : args);
  if (error) {
    // 28000 = invalid/expired session (raised by private.session_employee)
    if (error.code === "28000") onSessionExpired?.();
    throw new ApiError(error.message, error.code);
  }
  if (NOTIFIES.has(fn) && !(fn === "att_import" && args.p_dry)) sendPushesNow();
  return data as T;
}

interface SessionPayload {
  token: string;
  employee: Employee;
  permissions: Permissions;
  /** Saved "Customise dashboard" layout; absent/null = the role default. */
  dashboard?: SavedDashboard | null;
}

type EmployeeInput = Omit<Employee, "salary"> & { salary: number | "" };

export const api = {
  // Auth
  login: (email: string, password: string) =>
    rpc<SessionPayload | null>("login_employee", { p_email: email, p_password: password }, false),
  logout: () => rpc<void>("logout_employee"),
  me: () => rpc<Omit<SessionPayload, "token">>("get_me"),
  changePassword: (current: string, next: string) =>
    rpc<void>("change_my_password", { p_current: current, p_new: next }),

  // Employees (HR / Admin)
  listEmployees: () => rpc<Employee[]>("list_employees"),
  createEmployee: (data: EmployeeInput, password: string) =>
    rpc<Employee>("create_employee", { p_data: data, p_password: password }),
  updateEmployee: (id: string, data: EmployeeInput) => rpc<Employee>("update_employee", { p_id: id, p_data: data }),
  resetPassword: (id: string, password: string) =>
    rpc<void>("reset_employee_password", { p_id: id, p_new_password: password }),

  // Permissions (HR / Admin)
  getPermissions: (employeeId: string) => rpc<Permissions>("get_employee_permissions", { p_employee_id: employeeId }),
  setPermission: (employeeId: string, module: ModuleKey, enabled: boolean) =>
    rpc<void>("set_employee_permission", { p_employee_id: employeeId, p_module: module, p_enabled: enabled }),

  // Attendance (supabase/attendance.sql)
  attMonth: (employeeId: string | null, month: string) => rpc<AttMonth>("att_month", { p_emp: employeeId, p_month: month }),
  attTeamDays: (month: string, employeeId: string | null) => rpc<{ employee: PersonRef; day: AttDay }[]>("att_team_days", { p_month: month, p_emp: employeeId }),
  attSalarySheet: (month: string) => rpc<AttTeamMonthRow[]>("att_salary_sheet", { p_month: month }),
  attSetDay: (a: { employeeId: string; date: string; in: string; out: string; status: string; remark: string }) =>
    rpc<AttDay>("att_set_day", { p_emp: a.employeeId, p_date: a.date, p_in: a.in, p_out: a.out, p_status: a.status, p_remark: a.remark }),
  attDayChanges: (employeeId: string, date: string) => rpc<AttChange[]>("att_day_changes", { p_emp: employeeId, p_date: date }),
  attImport: (kind: string, rows: unknown[], map: Record<string, string>, fileName: string, dry: boolean) =>
    rpc<AttImportResult>("att_import", { p_kind: kind, p_rows: rows, p_map: map, p_file: fileName, p_dry: dry }),
  attUploads: () => rpc<{ id: string; kind: string; file: string; by: string | null; at: string; rows: number; added: number; updated: number; kept: number; from: string | null; to: string | null; deletedAt: string | null; deletedBy: string | null }[]>("att_uploads"),
  attDeleteUpload: (id: string) => rpc<{ removed: number; restored: number; kept: number }>("att_delete_upload", { p_upload: id }),
  attDashboard: () => rpc<AttDashboard>("att_dashboard"),
  attMyUpdates: () => rpc<{ month: string; updatedAt: string }[]>("att_my_updates"),
  attMarkChecked: (month: string) => rpc<void>("att_mark_checked", { p_month: `${month}-01` }),
  attMonthStatus: (month: string) => rpc<AttMonthStatus>("att_month_status", { p_month: `${month}-01` }),
  attLockMonth: (month: string, lock: boolean) => rpc<AttMonthStatus>("att_lock_month", { p_month: `${month}-01`, p_lock: lock }),
  publishPayslips: (month: string) => rpc<AttMonthStatus>("publish_payslips", { p_month: `${month}-01` }),
  unpublishPayslips: (month: string) => rpc<AttMonthStatus>("unpublish_payslips", { p_month: `${month}-01` }),
  myPayslips: () => rpc<{ month: string; final: number; netPayable: number; publishedAt: string }[]>("my_payslips"),
  myPayslip: (month: string) => rpc<Payslip>("my_payslip", { p_month: `${month}-01` }),
  attChecks: (month: string) => rpc<{ employee: PersonRef; updatedAt: string; checkedAt: string | null }[]>("att_checks", { p_month: `${month}-01` }),

  // Sales daily reports (Normal + Sole Selling)
  listProjects: () => rpc<Project[]>("list_projects"),
  saveProject: (id: string | null, name: string, status: Project["status"] | null) =>
    rpc<Project>("save_project", { p_id: id, p_name: name, p_status: status }),
  getEmployeeProjects: (employeeId: string) => rpc<string[]>("get_employee_projects", { p_employee_id: employeeId }),
  setEmployeeProjects: (employeeId: string, projectIds: string[]) =>
    rpc<void>("set_employee_projects", { p_employee_id: employeeId, p_project_ids: projectIds }),
  reportOptions: () => rpc<ReportOption[]>("report_options"),
  reportForm: (args: { reportId?: string | null; employeeId?: string | null; type?: SalesReportType | null; projectId?: string | null; date?: string | null }) =>
    rpc<ReportFormData>("report_form", {
      p_report_id: args.reportId ?? null, p_employee_id: args.employeeId ?? null, p_type: args.type ?? null,
      p_project: args.projectId ?? null, p_date: args.date ?? null,
    }),
  saveSalesReport: (args: { reportId?: string | null; employeeId?: string | null; type?: SalesReportType | null; projectId?: string | null; date?: string | null; payload: ReportPayload }) =>
    rpc<SalesReportDetail>("save_sales_report", {
      p_report_id: args.reportId ?? null, p_employee_id: args.employeeId ?? null, p_type: args.type ?? null,
      p_project: args.projectId ?? null, p_date: args.date ?? null, p_payload: args.payload,
    }),
  getReport: (id: string) => rpc<SalesReportDetail>("get_report", { p_report_id: id }),
  reportHistory: (id: string) => rpc<ReportChange[]>("report_history", { p_report_id: id }),
  mySalesReports: (month: string | null) => rpc<SalesReportRow[]>("my_sales_reports", { p_month: month }),
  listSalesReports: (f: { from: string; to: string; type: SalesReportType | null; projectId: string | null; employeeId: string | null }) =>
    rpc<SalesReportRow[]>("list_sales_reports", {
      p_from: f.from, p_to: f.to, p_type: f.type, p_project: f.projectId, p_employee_id: f.employeeId,
    }),
  teamReportSummary: (f: { date: string; type: SalesReportType | null; projectId: string | null; employeeId: string | null }) =>
    rpc<TeamSummaryGroup[]>("team_report_summary", { p_date: f.date, p_type: f.type, p_project: f.projectId, p_employee_id: f.employeeId }),
  getReportEmailRecipients: () => rpc<string[]>("get_report_email_recipients"),
  setReportEmailRecipients: (emails: string[]) => rpc<string[]>("set_report_email_recipients", { p_emails: emails }),
  getReportEmailTime: () => rpc<string>("get_report_email_time"),
  setReportEmailTime: (time: string) => rpc<string>("set_report_email_time", { p_time: time }),
  deleteSalesReport: (id: string) => rpc<void>("delete_sales_report", { p_report_id: id }),
  listEmployeeAliases: () => rpc<{ alias: string; employeeId: string }[]>("list_employee_aliases"),
  importReports: (data: unknown) => rpc<Record<string, number>>("import_reports", { p_data: data }),

  // Leave (supabase/leave.sql)
  leaveOverview: () => rpc<LeaveOverview>("leave_overview"),
  leaveUploadChunk: (uploadId: string, seq: number, base64: string) =>
    rpc<void>("leave_upload_chunk", { p_upload: uploadId, p_seq: seq, p_data: base64 }),
  leavePreview: (f: { start: string; end: string; half: string | null }) =>
    rpc<LeavePreview>("leave_preview", { p_kind: "Leave", p_start: f.start, p_end: f.end, p_half: f.half, p_comp_off: null }),
  leaveApply: (data: Record<string, unknown>) => rpc<LeaveApplication>("leave_apply", { p_data: data }),
  leaveCancel: (id: string, from: string | null, note: string) =>
    rpc<LeaveApplication>("leave_cancel", { p_id: id, p_from: from, p_note: note }),
  leaveTimeline: (id: string) => rpc<{ at: string; by: string | null; action: string; details: string | null }[]>("leave_timeline", { p_id: id }),
  leaveAttachment: (id: string) => rpc<{ name: string; mime: string; data: string } | null>("leave_attachment", { p_id: id }),
  leaveQueue: (status: "Pending" | "Upcoming" | "All") => rpc<LeaveApplication[]>("leave_queue", { p_status: status }),
  leaveDecide: (id: string, approve: boolean, note: string) =>
    rpc<LeaveApplication>("leave_decide", { p_id: id, p_approve: approve, p_note: note }),
  leaveDashboard: () => rpc<LeaveDashboard>("leave_dashboard"),

  // Notifications (supabase/notifications.sql)
  notifications: () => rpc<NotificationList>("notifications_list"),
  markNotificationRead: (id: number | null) => rpc<void>("notifications_read", { p_id: id }),
  notificationPrefs: () => rpc<{ off: string[] }>("notification_prefs_get"),
  setNotificationPref: (type: string, on: boolean) => rpc<{ off: string[] }>("notification_prefs_set", { p_type: type, p_on: on }),
  notifyTest: () => rpc<void>("notify_test"),
  pushSubscribe: (s: { endpoint: string; p256dh: string; auth: string }) =>
    rpc<void>("push_subscribe", { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_user_agent: navigator.userAgent }),
  pushUnsubscribe: (endpoint: string) => rpc<void>("push_unsubscribe", { p_endpoint: endpoint }),
  getReportReminders: () => rpc<boolean>("get_report_reminders"),
  setReportReminders: (on: boolean) => rpc<boolean>("set_report_reminders", { p_on: on }),
  getVisitReminder: () => rpc<{ on: boolean; time: string }>("get_visit_reminder"),
  setVisitReminder: (on: boolean | null, time: string | null) => rpc<{ on: boolean; time: string }>("set_visit_reminder", { p_on: on, p_time: time }),
  reportLeaderboard: (month: string) => rpc<Leaderboard>("report_leaderboard", { p_month: `${month}-01` }),
  getReportReminderTime: () => rpc<string>("get_report_reminder_time"),
  setReportReminderTime: (time: string) => rpc<string>("set_report_reminder_time", { p_time: time }),

  // Dashboards
  employeeDashboard: () => rpc<EmployeeDashboard>("employee_dashboard"),
  adminDashboard: () => rpc<AdminDashboard>("admin_dashboard"),
  saveDashboardLayout: (layout: DashboardItem[] | null, preset: string | null) =>
    rpc<SavedDashboard | null>("save_dashboard_layout", { p_layout: layout, p_preset: preset }),
};

/** The current session token, for calls to the panel's own server routes. */
export function getSessionToken() {
  return sessionToken;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
