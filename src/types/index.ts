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
  "analytics",
  "leave",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Permissions = Record<ModuleKey, boolean>;

export interface EmployeeDashboard {
  recentReports: { id: string; date: string; type: SalesReportType; title: string }[];
  reportFiledToday: boolean;
  month?: { reports: number; leads: number; calls: number };
}

export interface EmployeeStat {
  employee: Employee;
  reportsThisMonth: number;
}

export interface AdminDashboard {
  totalEmployees: number;
  activeEmployees: number;
  reportsToday: number;
  pendingReports: number;
  reportsThisMonth?: number;
  recentReports?: { id: string; date: string; employeeName: string; title: string }[];
  employeeStats: EmployeeStat[];
}

/** One "Customise dashboard" row, in display order. */
export interface DashboardItem { id: string; on: boolean }
export interface SavedDashboard { layout: DashboardItem[]; preset: string }

// ---------------------------------------------------------------------------
// Attendance — see supabase/attendance.sql
// ---------------------------------------------------------------------------
export type AttStatus = "Present" | "Absent" | "Weekoff" | "Paid Leave";

export interface AttDay {
  date: string;
  in: string | null;
  out: string | null;
  minutes: number | null;
  status: AttStatus;
  note: string;
  late: boolean;
  shortDay: boolean;
  lateHalf: boolean;
  edited: boolean;
  source: "etimeoffice" | "template" | "history" | "manual" | null;
  hasRow: boolean;
}

export interface AttSummary {
  daysInMonth: number;
  days: number;
  present: number;
  /** Absent shown = absent days − weekly-off working (script.js "unpaid leave"). */
  absent: number;
  absentDays: number;
  /** Days worked on the person's own weekly off, capped at the absent days. */
  weekoffWorked: number;
  weekoff: number;
  paidLeave: number;
  lates: number;
  latesCounted: number;
  lateHalves: number;
  lateDeduction: number;
  shortDays: number;
  netPayable: number;
  lastDay: string | null;
}

/** Only ever present for an Admin (the database leaves it out for everyone else). */
export interface AttSalary { monthly: number; final: number }

export interface AttMonth {
  employee: PersonRef & { weekOff: number | null };
  month: string;
  summary: AttSummary;
  salary: AttSalary | null;
  days: AttDay[];
}

export interface AttTeamMonthRow { employee: PersonRef; summary: AttSummary; salary: AttSalary | null }
export interface AttTeamDayRow { employee: PersonRef; day: AttDay | null }
export interface AttChange { at: string; by: string | null; field: string; old: string | null; new: string | null }

export interface AttImportResult {
  dry: boolean;
  rows: number;
  from: string | null;
  to: string | null;
  future: number;
  unmatched: { code: string; name: string | null; rows: number }[];
  errors: { row: number; message: string }[];
  errorCount: number;
  people: { employee: PersonRef; days: number; present: number; absent: number; weekoff: number; paidLeave: number; late: number; short: number; kept: number; from: string; to: string }[];
  comparison: { employee: PersonRef; date: string; in: string | null; out: string | null; sheetLate: string; sheetHalf: string; late: string; half: string }[];
  added: number;
  updated: number;
  kept: number;
  unchanged: number;
}

export interface AttDashboard {
  mine: AttSummary | null;
  team: { date: string; present: number; late: number; absent: number; onLeave: number } | null;
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

export interface TeamSummaryGroup {
  type: SalesReportType;
  projectId: string | null;
  title: string;
  // off: "On leave" | "Half-day leave" | "Weekly off" on the summary date, else null.
  rows: { employeeId: string; employeeName: string; filedToday: boolean; off?: string | null; today: ReportTotals; mtd: ReportTotals }[];
  totals: { today: ReportTotals; mtd: ReportTotals };
}

// ---------------------------------------------------------------------------
// Leave — see supabase/leave.sql
// ---------------------------------------------------------------------------
export type LeaveKind = "Leave";
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export interface PersonRef { id: string; name: string; department: Department; role: Role }

export interface LeaveApplication {
  id: string;
  employee: PersonRef;
  kind: LeaveKind;
  start: string;
  end: string;
  half: "first" | "second" | null;
  reason: string;
  days: number;
  dayList: { date: string; portion: number }[];
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  cancelledFrom: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelNote: string | null;
  createdAt: string;
  attachment: { name: string; mime: string; size: number } | null;
  canCancel: boolean;
  canCancelRemaining: boolean;
  canDecide: boolean;
  // Approver list only
  warnings?: string[];
  taken?: { month: number; year: number };
  visitChanges?: string[];
}

export interface LeaveOverview {
  today: string;
  canApply: boolean;
  weekOff: number | null;
  stats: { month: number; year: number };
  applications: LeaveApplication[];
}

export interface LeaveVisit {
  id: string;
  client: string;
  date: string;
  type: SalesReportType;
  title: string;
  colleagues: { id: string; name: string }[];
}

export interface LeavePreview {
  days: { date: string; portion: number }[];
  total: number;
  skipped: number;
  visits: LeaveVisit[];
}

export interface LeaveDashboard {
  nextLeave: LeaveApplication | null;
  myPending: number;
  onLeaveToday: { id: string; name: string; portion: number }[] | null;
  pendingApprovals: number | null;
}

// ---------------------------------------------------------------------------
// Notifications — see supabase/notifications.sql
// ---------------------------------------------------------------------------
export interface AppNotification { id: number; type: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }
export interface NotificationList { unread: number; items: AppNotification[] }
