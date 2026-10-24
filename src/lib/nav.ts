import {
  LayoutDashboard, CalendarCheck, FileText, User, Settings,
  Users, ShieldCheck, LucideIcon,
} from "lucide-react";
import { Employee, Permissions } from "@/types";
import { FeatureKey, isFeatureEnabled } from "@/lib/features";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function navFor(user: Employee, permissions: Permissions | null): NavItem[] {
  const can = (key: keyof Permissions) => !!permissions?.[key];
  const isManager = user.role === "Admin" || user.role === "HR";

  // A switched-off feature is shown to everyone, marked "Coming soon". Once it's
  // switched on, the usual role/permission rule decides whether it appears.
  const feature = (key: FeatureKey, item: NavItem, allowed: boolean): NavItem | false =>
    isFeatureEnabled(key) ? allowed && item : { ...item, comingSoon: true };

  const attendance = feature("attendance", { href: "/attendance", label: "Attendance", icon: CalendarCheck }, isManager || can("attendance"));
  const reports = feature("reports", { href: "/reports", label: "Daily Reports", icon: FileText }, isManager || can("normalReport") || can("soleSelling"));

  const items: (NavItem | false)[] = isManager
    ? [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/employees", label: "Employees", icon: Users },
        attendance, reports,
        { href: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
        { href: "/profile", label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        attendance, reports,
        { href: "/profile", label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
      ];
  return items.filter((i): i is NavItem => !!i);
}
