"use client";

import { useEffect } from "react";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { isFeatureEnabled } from "@/lib/features";

const EVENT = "att-updates-changed";

/** Tell every screen showing the "attendance updated" mark to refresh. */
export function attUpdatesChanged() {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Months of the signed-in person's attendance that HR/Admin updated and the
 * person hasn't marked as checked yet. Empty for Admin (no own attendance).
 */
export function useAttUpdates() {
  const { user, isManager, permissions } = useSession();
  const enabled = !!user && user.role !== "Admin" && isFeatureEnabled("attendance") && (isManager || !!permissions?.attendance);
  const q = useApi(() => (enabled ? api.attMyUpdates() : Promise.resolve([])), [enabled, user?.id]);
  const { reload } = q;
  useEffect(() => {
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, [reload]);
  return q;
}
