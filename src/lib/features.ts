import { ModuleKey } from "@/types";

/**
 * Feature switches. To launch a feature, change its `enabled` to true and
 * redeploy — the sidebar, dashboards, permissions page and URL guard all
 * follow this list. While a feature is off its pages show "Coming soon";
 * nothing in the database is changed either way.
 */
export const FEATURES = {
  attendance: { label: "Attendance", enabled: false },
  reports: { label: "Daily Reports", enabled: true },
  leave: { label: "Leave", enabled: true },
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureEnabled(key: FeatureKey) {
  return FEATURES[key].enabled;
}

/** URL prefixes owned by each feature, including any /admin variants. */
export const FEATURE_ROUTES: Record<FeatureKey, string[]> = {
  attendance: ["/attendance", "/admin/attendance"],
  reports: ["/reports", "/admin/reports"],
  leave: ["/leave", "/admin/leave"],
};

/** The feature a path belongs to, if any. Matches the prefix and anything below it. */
export function featureForPath(pathname: string): FeatureKey | null {
  for (const key of FEATURE_KEYS) {
    if (FEATURE_ROUTES[key].some((p) => pathname === p || pathname.startsWith(`${p}/`))) return key;
  }
  return null;
}

/** Which feature each permission module belongs to. Modules not listed are always "Coming soon". */
export const MODULE_FEATURE: Partial<Record<ModuleKey, FeatureKey>> = {
  attendance: "attendance",
  normalReport: "reports",
  soleSelling: "reports",
  leave: "leave",
};
