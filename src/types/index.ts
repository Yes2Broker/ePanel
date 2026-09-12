export type Department = "Sales" | "Tech" | "HR" | "Admin";
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
}

export type TaskPriority = "Low" | "Medium" | "High";
export type TaskStatus = "Pending" | "Completed";

export interface PersonalTask {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
}

export type AttendanceStatus = "Present" | "Late" | "Absent" | "Leave";

export interface AttendanceRow {
  date: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  status: AttendanceStatus;
}

export type ReportType = "Normal" | "Sole Selling";
export type ReportStatus = "Draft" | "Submitted" | "Approved";

export interface DailyReport {
  id: string;
  date: string;
  type: ReportType;
  status: ReportStatus;
  updated: string;
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

export type PermissionMap = Record<string, Record<ModuleKey, boolean>>;
