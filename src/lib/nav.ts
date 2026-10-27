import {
  LayoutDashboard, CalendarCheck, FileText, User, Settings,
  Users, ShieldCheck, Building2, BarChart3, CalendarOff, LucideIcon,
} from "lucide-react";
import { Employee, Permissions } from "@/types";
import { FEATURES, FeatureKey, featureForPath, isFeatureEnabled, pageAccess } from "@/lib/features";

export interface NavItem {
  href: string;
  label: string;
  short?: string; // label in the phone bottom bar, when shorter
  icon: LucideIcon;
  comingSoon?: boolean;
  external?: boolean; // another Yes2Broker site, opened in a new tab
}

const BUILDER_DATA_URL = "https://yes2broker.github.io/Builder-Data/";
const ANALYTICS_URL = "https://analytics.yes2broker.in/";

/** Every item this person may see, by name. Missing = not allowed. */
function itemsFor(user: Employee, permissions: Permissions | null) {
  const can = (key: keyof Permissions) => !!permissions?.[key];
  const isManager = user.role === "Admin" || user.role === "HR";
  const pages = pageAccess(user.role, permissions);

  // A switched-off feature is shown to everyone, marked "Coming soon". Once it's
  // switched on, the usual role/permission rule decides whether it appears.
  const feature = (key: FeatureKey, item: NavItem, allowed: boolean): NavItem | false =>
    isFeatureEnabled(key) ? allowed && item : { ...item, comingSoon: true };

  return {
    dashboard: { href: isManager ? "/admin" : "/dashboard", label: "Dashboard", icon: LayoutDashboard } as NavItem,
    employees: isManager && ({ href: "/admin/employees", label: "Employees", icon: Users } as NavItem),
    attendance: feature("attendance", { href: "/attendance", label: "Attendance", icon: CalendarCheck }, pages.attendance),
    reports: feature("reports", { href: "/reports", label: "Daily Reports", short: "Reports", icon: FileText }, pages.reports),
    leave: feature("leave", { href: "/leave", label: "Leave", icon: CalendarOff }, pages.leave),
    builderData: can("builderData") &&({ href: BUILDER_DATA_URL, label: "Builder Data", icon: Building2, external: true } as NavItem),
    analytics: user.role === "Admin" && can("analytics") && ({ href: ANALYTICS_URL, label: "Analytics", icon: BarChart3, external: true } as NavItem),
    permissions: isManager && ({ href: "/admin/permissions", label: "Permissions", icon: ShieldCheck } as NavItem),
    profile: { href: "/profile", label: "Profile", icon: User } as NavItem,
    settings: { href: "/settings", label: "Settings", icon: Settings } as NavItem,
  };
}

const present = (items: (NavItem | false)[]) => items.filter((i): i is NavItem => !!i);

/** Desktop / tablet sidebar. */
export function navFor(user: Employee, permissions: Permissions | null): NavItem[] {
  const i = itemsFor(user, permissions);
  return present([i.dashboard, i.employees, i.attendance, i.reports, i.leave, i.builderData, i.analytics, i.permissions, i.profile, i.settings]);
}

/**
 * Phone bottom bar: up to four direct items plus "More" (a sheet with the rest,
 * Profile, Settings, Install app and Log out live in the avatar menu). Everyone gets Dashboard, Reports, Attendance and
 * Leave when they have them; HR and Admin find Employees at the top of More.
 */
export function bottomNavFor(user: Employee, permissions: Permissions | null): { bar: NavItem[]; more: NavItem[] } {
  const i = itemsFor(user, permissions);
  const live = (item: NavItem | false) => !!item && !item.comingSoon && item;
  const bar = present([i.dashboard, live(i.reports), live(i.attendance), live(i.leave)]);
  if (bar.length < 3) bar.push(i.profile);
  const inBar = new Set(bar.map((b) => b.href));
  const more = present([i.employees, i.reports, i.leave, i.attendance, i.builderData, i.analytics, i.permissions])
    .filter((m) => !inBar.has(m.href));
  return { bar, more };
}

export function isActivePath(item: NavItem, pathname: string) {
  if (item.external) return false;
  // Dashboards must match exactly, otherwise "/admin" would also light up on /admin/employees.
  if (item.href === "/admin" || item.href === "/dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Short title for the phone top bar. */
export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/reports/fill")) return "New report";
  if (pathname.startsWith("/reports/edit")) return "Edit report";
  if (pathname.startsWith("/reports/import")) return "Import old data";
  if (pathname.startsWith("/leave")) return "Leave";
  if (pathname.startsWith("/attendance")) return "Attendance";
  const feature = featureForPath(pathname) ?? (pathname.startsWith("/coming-soon/") ? (pathname.split("/")[2] as FeatureKey) : null);
  if (feature && FEATURES[feature]) return FEATURES[feature].label;
  const titles: [string, string][] = [
    ["/admin/employees", "Employees"], ["/admin/permissions", "Permissions"], ["/admin", "Dashboard"],
    ["/dashboard", "Dashboard"], ["/profile", "Profile"], ["/settings", "Settings"],
  ];
  return titles.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? "Yes2Broker";
}
