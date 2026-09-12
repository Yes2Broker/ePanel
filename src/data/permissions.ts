import { employees } from "./employees";
import { PermissionMap, MODULE_KEYS } from "@/types";

export const MODULES: { key: (typeof MODULE_KEYS)[number]; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "tasks", label: "My Tasks" },
  { key: "normalReport", label: "Normal Daily Report" },
  { key: "soleSelling", label: "Sole Selling Daily Report" },
  { key: "builderData", label: "Builder Data" },
  { key: "inquiryForm", label: "Inquiry Form" },
  { key: "analytics", label: "Analytics" },
];

export const permissionsInitial: PermissionMap = Object.fromEntries(
  employees.map((e) => [
    e.id,
    {
      attendance: true,
      tasks: true,
      normalReport: e.department === "Sales" || e.department === "Admin",
      soleSelling: e.department === "Sales",
      builderData: false,
      inquiryForm: false,
      analytics: e.role !== "Employee",
    },
  ])
);
