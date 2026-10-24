import { supabase } from "@/lib/supabase";
import {
  AdminDashboard, AttendanceRecord, Employee, EmployeeDashboard, ModuleKey, Permissions,
  TeamAttendanceRow, Project, ReportOption, ReportFormData, ReportPayload,
  SalesReportDetail, SalesReportRow, ReportChange, TeamSummaryGroup, SalesReportType, StaleVisit,
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

  // Attendance
  checkIn: () => rpc<AttendanceRecord>("check_in"),
  checkOut: () => rpc<AttendanceRecord>("check_out"),
  myAttendance: (month: string) => rpc<AttendanceRecord[]>("my_attendance", { p_month: month }),
  teamAttendance: (date: string) => rpc<TeamAttendanceRow[]>("team_attendance", { p_date: date }),
  setAttendance: (args: { employeeId: string; date: string; status: string; checkIn: string; checkOut: string; note: string }) =>
    rpc<AttendanceRecord>("set_attendance", {
      p_employee_id: args.employeeId, p_date: args.date, p_status: args.status,
      p_check_in: args.checkIn || null, p_check_out: args.checkOut || null, p_note: args.note,
    }),

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
