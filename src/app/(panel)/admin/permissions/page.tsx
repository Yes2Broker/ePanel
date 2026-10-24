"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/button";
import { ErrorBanner, Loading, PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { MODULES } from "@/lib/constants";
import { MODULE_FEATURE, isFeatureEnabled } from "@/lib/features";
import { ComingSoonBadge } from "@/components/feature/coming-soon";
import { ModuleKey } from "@/types";
import { initials, cn } from "@/lib/utils";
import { SoleSellingProjects } from "@/components/reports/sole-selling-projects";

// A module can't be switched while its feature isn't launched; the saved
// value is still shown and kept as it is in the database.
function isComingSoon(m: (typeof MODULES)[number]) {
  const feature = MODULE_FEATURE[m.key];
  return !!m.comingSoon || (!!feature && !isFeatureEnabled(feature));
}

export default function AdminPermissionsPage() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const employees = useApi(() => api.listEmployees());
  const active = (employees.data ?? []).filter((e) => e.status === "Active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && active.length) setSelectedId(active[0].id);
  }, [active, selectedId]);

  const permissions = useApi(
    () => (selectedId ? api.getPermissions(selectedId) : Promise.resolve(null)),
    [selectedId]
  );
  const employee = active.find((e) => e.id === selectedId);

  const toggle = async (moduleKey: ModuleKey, value: boolean) => {
    if (!selectedId || !permissions.data) return;
    const before = permissions.data;
    permissions.setData({ ...before, [moduleKey]: value });
    try {
      await api.setPermission(selectedId, moduleKey, value);
      if (selectedId === user?.id) refresh(); // your own sidebar should update straight away
    } catch (err) {
      permissions.setData(before);
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="space-y-5 pt-4">
      <PageHeader title="Permissions" subtitle="Choose which modules an employee can access. Changes apply on their next page load." />
      <ErrorBanner message={employees.error} onRetry={employees.reload} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-2 lg:col-span-1">
          {employees.loading && !employees.data ? <Loading /> : (
            <ul className="max-h-[520px] space-y-0.5 overflow-y-auto">
              {active.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setSelectedId(e.id)}
                    className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm", selectedId === e.id ? "bg-ink text-white" : "text-ink hover:bg-surface")}
                  >
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium", selectedId === e.id ? "bg-brand text-ink" : "bg-status-neutralBg text-ink-muted")}>
                      {initials(e.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.name}</p>
                      <p className={cn("truncate text-xs", selectedId === e.id ? "text-white/70" : "text-ink-faint")}>{e.department} · {e.role}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          {employee && (
            <>
              <div className="mb-5 flex items-center gap-3 border-b border-surface-border pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-medium text-white">{initials(employee.name)}</div>
                <div>
                  <p className="text-sm font-semibold text-ink">{employee.name}</p>
                  <p className="text-xs text-ink-faint">{employee.department} · {employee.role}</p>
                </div>
              </div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-faint">Module Access</p>
              <ErrorBanner message={permissions.error} onRetry={permissions.reload} />
              {permissions.loading && !permissions.data ? <Loading /> : permissions.data && (
                <div className="space-y-1">
                  {MODULES.map((m) => (
                    <div key={m.key}>
                      <div className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-surface">
                        <span className="text-sm text-ink">
                          {m.label}
                          {isComingSoon(m) && <span className="ml-2"><ComingSoonBadge /></span>}
                        </span>
                        <Toggle checked={!!permissions.data?.[m.key]} disabled={permissions.loading || isComingSoon(m)} onChange={(v) => toggle(m.key, v)} />
                      </div>
                      {m.key === "soleSelling" && !isComingSoon(m) && permissions.data?.soleSelling && selectedId && (
                        <SoleSellingProjects employeeId={selectedId} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
