export type Department = "Sales" | "Tech" | "HR" | "Admin" | "Management";
export type Role = "Employee" | "HR" | "Admin";
export type EmploymentStatus = "Active" | "Inactive";

export interface Employee {
  id: string;
  name: string;
  email: string;
  mobile: string;
  department: Department;
  role: Role;
  designation: string;
  salary: number;
  joiningDate: string;
  manager: string;
  status: EmploymentStatus;
  weekOff: number | null; // ISO weekday 1 = Monday ... 7 = Sunday; null = no weekly off
}

export const MODULE_KEYS = [
  "attendance",
  "normalReport",
  "soleSelling",
  "builderData",
  "inquiryForm",
  "analytics",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Permissions = Record<ModuleKey, boolean>;

export type AttendanceStatus = "Present" | "Late" | "Half Day" | "Absent" | "Leave";

export interface AttendanceRecord {
  date: string;
  checkIn: string | null; // ISO timestamp
  checkOut: string | null;
  minutes: number | null;
  status: AttendanceStatus | null; // null = today, not checked in yet
  note: string;
}

export interface TeamAttendanceRow extends AttendanceRecord {
  employee: Employee;
}

export interface EmployeeDashboard {
  today: AttendanceRecord | null;
  isWorkingDay: boolean;
  month: { present: number; late: number; leave: number; workingDays: number; rate: number | null };
  recentReports: { id: string; date: string; type: SalesReportType; title: string }[];
  reportFiledToday: boolean;
}

export interface EmployeeStat {
  employee: Employee;
  attendanceRate: number | null;
  reportsThisMonth: number;
  checkedInToday: boolean;
}

export interface AdminDashboard {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  reportsToday: number;
  pendingReports: number;
  weeklyTrend: { date: string; day: string; rate: number }[];
  monthlyTrend: { month: string; rate: number | null }[];
  employeeStats: EmployeeStat[];
}

// ---------------------------------------------------------------------------
// Daily reports (Normal + Sole Selling) — see supabase/reports.sql
// ---------------------------------------------------------------------------
export type SalesReportType = "Normal" | "Sole Selling";

export interface Project {
  id: string;
  name: string;
  status: "Active" | "Closed";
  people?: number;
  reports?: number;
}

export interface ReportOption {
  type: SalesReportType;
  projectId: string | null;
  projectName: string | null;
  title: string;
  todayReportId: string | null;
}

export interface ReportTotals {
  leads: number;
  calls: number;
  positive: number;
  scheduled: number;
  done: number;
  tokens: number;
  walkIn: number;
  siteVisitConversion: string;
  closureConversion: string;
}

export interface SalesReportRow {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: SalesReportType;
  projectId: string | null;
  projectName: string | null;
  title: string;
  leads: number;
  calls: number;
  positive: number;
  scheduled: number;
  done: number;
  tokens: number;
  walkIn: number;
  source: "panel" | "import";
  submittedAt: string;
  editableUntil: string;
  updatedAt: string | null;
  canEdit?: boolean;
}

export interface SalesReportDetail extends SalesReportRow {
  today: ReportTotals;
  mtd: ReportTotals;
  doneVisits: { client: string; time: string; kind: string }[];
  walkIns: string[];
  scheduledDetails: { client: string; date: string; rescheduleDate: string | null; status: string }[];
  submittedByName: string | null;
  updatedByName: string | null;
  changeCount: number;
  canEdit?: boolean;
}

export interface ReportChange {
  at: string;
  by: string | null;
  field: string;
  old: string | null;
  new: string | null;
}

export type VisitActionType = "done" | "reschedule" | "cancel";

export interface ReportFormData {
  existingReportId?: string;
  employee: { id: string; name: string };
  type: SalesReportType;
  project: Project | null;
  title: string;
  date: string;
  isToday: boolean;
  nowTime: string;
  report: SalesReportRow | null;
  scheduled: { id: string; client: string; date: string; locked: boolean }[];
  todayVisits: {
    id: string; client: string; visitDate: string; rescheduleDate: string | null; bookedOn: string; bookedHere: boolean; overdue: boolean;
    action: { action: VisitActionType; time: string | null; date: string | null; reason: string | null; frozen: boolean } | null;
  }[];
  futureVisits: { id: string; client: string; date: string }[];
  futureDone: { visitId: string; time: string; frozen: boolean }[];
  walkIns: string[];
}

export interface ReportPayload {
  leads: number;
  calls: number;
  positive: number;
  tokens: number;
  scheduledCount?: number;
  doneCount?: number;
  walkInCount?: number;
  scheduled: { id?: string; tempId?: string; client: string; date: string }[];
  actions: { visitId?: string; tempId?: string; action: VisitActionType; time?: string; date?: string; reason?: string }[];
  futureDone: { visitId: string; time: string }[];
  walkIns: string[];
}

export interface StaleVisit {
  id: string;
  client: string;
  employeeId: string;
  employeeName: string;
  type: SalesReportType;
  projectName: string | null;
  bookedOn: string;
  date: string;
}

export interface TeamSummaryGroup {
  type: SalesReportType;
  projectId: string | null;
  title: string;
  rows: { employeeId: string; employeeName: string; filedToday: boolean; today: ReportTotals; mtd: ReportTotals }[];
  totals: { today: ReportTotals; mtd: ReportTotals };
}
