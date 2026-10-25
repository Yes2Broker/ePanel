import { supabase } from "@/lib/supabase";
import {
  AdminDashboard, Employee, EmployeeDashboard, ModuleKey, Permissions,
  Project, ReportOption, ReportFormData, ReportPayload,
  AttMonth, AttTeamMonthRow, AttTeamDayRow, AttDay, AttChange, AttImportResult, AttDashboard, PersonRef,
  SalesReportDetail, SalesReportRow, ReportChange, TeamSummaryGroup, SalesReportType, StaleVisit,
  LeaveOverview, LeaveKind, LeavePreview, LeaveApplication, CompOffClaim, LeaveCalendarDay, LeaveSummaryRow,
  Holiday, LeaveDashboard,
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

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, withToken = true): Promise<T> {
  const { data, error } = await supabase.rpc(fn, withToken ? { p_token: sessionToken, ...args } : args);
  if (error) {
    // 28000 = invalid/expired session (raised by private.session_employee)
    if (error.code === "28000") onSessionExpired?.();
    throw new ApiError(error.message, error.code);
  }
  return data as T;
}

export interface SessionPayload {
  token: string;
  employee: Employee;
  permissions: Permissions;
}

export type EmployeeInput = Omit<Employee, "salary"> & { salary: number | "" };

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
  attTeamMonth: (month: string) => rpc<AttTeamMonthRow[]>("att_team_month", { p_month: month }),
  attTeamDay: (date: string) => rpc<AttTeamDayRow[]>("att_team_day", { p_date: date }),
  attMissed: () => rpc<{ employee: PersonRef; day: AttDay }[]>("att_missed"),
  attSalarySheet: (month: string) => rpc<AttTeamMonthRow[]>("att_salary_sheet", { p_month: month }),
  attSetDay: (a: { employeeId: string; date: string; in: string; out: string; status: string; remark: string }) =>
    rpc<AttDay>("att_set_day", { p_emp: a.employeeId, p_date: a.date, p_in: a.in, p_out: a.out, p_status: a.status, p_remark: a.remark }),
  attDayChanges: (employeeId: string, date: string) => rpc<AttChange[]>("att_day_changes", { p_emp: employeeId, p_date: date }),
  attImport: (kind: string, rows: unknown[], map: Record<string, string>, fileName: string, dry: boolean) =>
    rpc<AttImportResult>("att_import", { p_kind: kind, p_rows: rows, p_map: map, p_file: fileName, p_dry: dry }),
  attUploads: () => rpc<{ id: string; kind: string; file: string; by: string | null; at: string; rows: number; added: number; updated: number; kept: number; from: string | null; to: string | null }[]>("att_uploads"),
  attDashboard: () => rpc<AttDashboard>("att_dashboard"),

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
  listEmployeeAliases: () => rpc<{ alias: string; employeeId: string }[]>("list_employee_aliases"),
  importReports: (data: unknown) => rpc<Record<string, number>>("import_reports", { p_data: data }),
  listStaleVisits: () => rpc<StaleVisit[]>("list_stale_visits"),
  closeStaleVisits: (ids: string[], status: "Done" | "Cancelled", reason: string) =>
    rpc<number>("close_stale_visits", { p_ids: ids, p_status: status, p_reason: reason }),

  // Leave (supabase/leave.sql)
  leaveOverview: () => rpc<LeaveOverview>("leave_overview"),
  leaveUploadChunk: (uploadId: string, seq: number, base64: string) =>
    rpc<void>("leave_upload_chunk", { p_upload: uploadId, p_seq: seq, p_data: base64 }),
  leavePreview: (f: { kind: LeaveKind; start: string; end: string; half: string | null; compOffId: string | null }) =>
    rpc<LeavePreview>("leave_preview", { p_kind: f.kind, p_start: f.start, p_end: f.end, p_half: f.half, p_comp_off: f.compOffId }),
  leaveApply: (data: Record<string, unknown>) => rpc<LeaveApplication>("leave_apply", { p_data: data }),
  leaveCancel: (id: string, from: string | null, note: string) =>
    rpc<LeaveApplication>("leave_cancel", { p_id: id, p_from: from, p_note: note }),
  leaveTimeline: (id: string) => rpc<{ at: string; by: string | null; action: string; details: string | null }[]>("leave_timeline", { p_id: id }),
  leaveAttachment: (id: string) => rpc<{ name: string; mime: string; data: string } | null>("leave_attachment", { p_id: id }),
  compOffClaim: (date: string, note: string) => rpc<CompOffClaim>("comp_off_claim", { p_date: date, p_note: note }),
  compOffCancel: (id: string) => rpc<CompOffClaim>("comp_off_cancel", { p_id: id }),
  leaveQueue: (status: "Pending" | "Upcoming" | "All") => rpc<LeaveApplication[]>("leave_queue", { p_status: status }),
  leaveDecide: (id: string, approve: boolean, note: string) =>
    rpc<LeaveApplication>("leave_decide", { p_id: id, p_approve: approve, p_note: note }),
  compOffList: (status: "Pending" | "All") => rpc<CompOffClaim[]>("comp_off_list", { p_status: status }),
  compOffDecide: (id: string, approve: boolean, note: string) =>
    rpc<CompOffClaim>("comp_off_decide", { p_id: id, p_approve: approve, p_note: note }),
  leaveCalendar: (month: string) => rpc<{ from: string; to: string; days: LeaveCalendarDay[] }>("leave_calendar", { p_month: month }),
  leaveMonthSummary: (month: string) => rpc<LeaveSummaryRow[]>("leave_month_summary", { p_month: month }),
  holidayList: (year: number) => rpc<Holiday[]>("holiday_list", { p_year: year }),
  holidaySave: (date: string, name: string) => rpc<void>("holiday_save", { p_date: date, p_name: name }),
  holidayDelete: (date: string) => rpc<void>("holiday_delete", { p_date: date }),
  leaveDashboard: () => rpc<LeaveDashboard>("leave_dashboard"),

  // Dashboards
  employeeDashboard: () => rpc<EmployeeDashboard>("employee_dashboard"),
  adminDashboard: () => rpc<AdminDashboard>("admin_dashboard"),
};

/** The current session token, for calls to the panel's own server routes. */
export function getSessionToken() {
  return sessionToken;
}

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
