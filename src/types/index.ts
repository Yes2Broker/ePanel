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
  "tasks",
  "normalReport",
  "soleSelling",
  "builderData",
  "inquiryForm",
  "analytics",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Permissions = Record<ModuleKey, boolean>;

export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "Pending" | "Completed";

export interface PersonalTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  createdAt: string;
}

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

export type LeaveType = "Casual" | "Sick" | "Earned" | "Unpaid";
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type ReportType = "Normal" | "Sole Selling";
export type ReportStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

export interface DailyReport {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: ReportType;
  data: Record<string, string | number>;
  status: ReportStatus;
  reviewNote: string;
  reviewedBy: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

export interface EmployeeDashboard {
  today: AttendanceRecord | null;
  isWorkingDay: boolean;
  month: { present: number; late: number; leave: number; workingDays: number; rate: number | null };
  tasks: { pending: number; completed: number; overdue: number; upcoming: PersonalTask[] };
  recentReports: DailyReport[];
  reportFiledToday: boolean;
  pendingLeaves: number;
  upcomingLeave: LeaveRequest | null;
}

export interface EmployeeStat {
  employee: Employee;
  attendanceRate: number | null;
  reportsThisMonth: number;
  tasksCompleted: number;
  checkedInToday: boolean;
}

export interface AdminDashboard {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  pendingLeaves: number;
  reportsToday: number;
  pendingReports: number;
  weeklyTrend: { date: string; day: string; rate: number }[];
  monthlyTrend: { month: string; rate: number | null }[];
  employeeStats: EmployeeStat[];
}
