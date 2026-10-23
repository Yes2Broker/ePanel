import {
  LayoutDashboard, CalendarCheck, CalendarOff, ListTodo, FileText, User, Settings,
  Users, ShieldCheck, LucideIcon,
} from "lucide-react";
import { Employee, Permissions } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function navFor(user: Employee, permissions: Permissions | null): NavItem[] {
  const can = (key: keyof Permissions) => !!permissions?.[key];
  const isManager = user.role === "Admin" || user.role === "HR";
  const items: (NavItem | false)[] = isManager
    ? [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/employees", label: "Employees", icon: Users },
        { href: "/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/leave", label: "Leave", icon: CalendarOff },
        { href: "/reports", label: "Daily Reports", icon: FileText },
        { href: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
        can("tasks") && { href: "/tasks", label: "My Tasks", icon: ListTodo },
        { href: "/profile", label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        can("attendance") && { href: "/attendance", label: "Attendance", icon: CalendarCheck },
        { href: "/leave", label: "Leave", icon: CalendarOff },
        can("tasks") && { href: "/tasks", label: "My Tasks", icon: ListTodo },
        (can("normalReport") || can("soleSelling")) && { href: "/reports", label: "Daily Reports", icon: FileText },
        { href: "/profile", label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
      ];
  return items.filter((i): i is NavItem => !!i);
}
