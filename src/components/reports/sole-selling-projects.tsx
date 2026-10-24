"use client";

import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/** Which sole selling projects one employee may report for (Permissions page). */
export function SoleSellingProjects({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const projects = useApi(() => api.listProjects());
  const assigned = useApi(() => api.getEmployeeProjects(employeeId), [employeeId]);
  const active = (projects.data ?? []).filter((p) => p.status === "Active");
  const ids = assigned.data ?? [];

  const toggle = async (projectId: string, on: boolean) => {
    const before = ids;
    const next = on ? [...ids, projectId] : ids.filter((i) => i !== projectId);
    assigned.setData(next);
    try {
      await api.setEmployeeProjects(employeeId, next);
    } catch (err) {
      assigned.setData(before);
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="mb-2 ml-3 rounded-xl border border-surface-border bg-surface/60 px-3 py-2.5">
      <p className="mb-2 text-xs font-medium text-ink-muted">Projects this person reports for</p>
      {projects.loading || assigned.loading ? <p className="text-xs text-ink-faint">Loading…</p>
        : active.length === 0 ? (
          <p className="text-xs text-ink-faint">No active projects. <Link href="/reports?tab=projects" className="underline">Add one</Link>.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((p) => {
              const on = ids.includes(p.id);
              return (
                <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                  on ? "border-ink bg-ink text-white" : "border-surface-border bg-white text-ink-muted")}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={(e) => toggle(p.id, e.target.checked)} />
                  {on ? "✓ " : ""}{p.name}
                </label>
              );
            })}
          </div>
        )}
      {!assigned.loading && active.length > 0 && ids.filter((i) => active.some((p) => p.id === i)).length === 0 && (
        <p className="mt-2 text-xs text-status-warning">Pick at least one project, or this person can&apos;t file a Sole Selling report.</p>
      )}
    </div>
  );
}
