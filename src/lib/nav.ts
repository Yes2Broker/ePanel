import {
  LayoutDashboard, CalendarCheck, ListTodo, FileText, User, Settings,
  Users, ShieldCheck,
} from "lucide-react";
import { Role } from "@/types";

export const EMPLOYEE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/tasks", label: "My Tasks", icon: ListTodo },
  { href: "/reports", label: "Daily Reports", icon: FileText },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/reports", label: "Daily Reports", icon: FileText },
  { href: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function navForRole(role: Role) {
  return role === "Admin" || role === "HR" ? ADMIN_NAV : EMPLOYEE_NAV;
}
