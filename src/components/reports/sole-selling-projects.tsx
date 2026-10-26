"use client";

import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Skeleton } from "@/components/ui/page";
import { CheckRow } from "@/components/ui/checkbox";

/** Which sole selling projects one employee may report for (Permissions page). */
export function SoleSellingProjects({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const projects = useApi(() => api.listProjects());
  const assigned = useApi(() => api.getEmployeeProjects(employeeId), [employeeId]);
  const active = (projects.data ?? []).filter((p) => p.status === "Active");
  const ids = assigned.data ?? [];

  const save = async (next: string[]) => {
    const before = ids;
    assigned.setData(next);
    try {
      await api.setEmployeeProjects(employeeId, next);
      toast("Saved");
    } catch (err) {
      assigned.setData(before);
      toast(errorMessage(err), "error");
    }
  };
  const toggle = (projectId: string, on: boolean) => save(on ? [...ids, projectId] : ids.filter((i) => i !== projectId));
  const activeIds = active.map((p) => p.id);

  return (
    <div className="mb-2 rounded-xl sm:ml-3 border border-surface-border bg-surface/60 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">Projects this person reports for</p>
        {active.length > 1 && !assigned.loading && (
          <div className="flex shrink-0 gap-1 text-xs font-medium">
            <button type="button" onClick={() => save(Array.from(new Set([...ids, ...activeIds])))} className="min-h-8 rounded-lg px-2 text-brand hover:bg-white">Select all</button>
            <button type="button" onClick={() => save(ids.filter((i) => !activeIds.includes(i)))} className="min-h-8 rounded-lg px-2 text-ink-muted hover:bg-white">Clear</button>
          </div>
        )}
      </div>
      {projects.loading || assigned.loading ? <div className="space-y-2"><Skeleton className="h-11 w-full rounded-xl" /><Skeleton className="h-11 w-full rounded-xl" /></div>
        : active.length === 0 ? (
          <p className="text-xs text-ink-faint">No active projects. <Link href="/reports?tab=projects" className="underline">Add one</Link>.</p>
        ) : (
          <div className="space-y-1.5">
            {active.map((p) => (
              <CheckRow key={p.id} checked={ids.includes(p.id)} onChange={(on) => toggle(p.id, on)} label={p.name} note={p.status} />
            ))}
          </div>
        )}
      {!assigned.loading && active.length > 0 && ids.filter((i) => active.some((p) => p.id === i)).length === 0 && (
        <p className="mt-2 text-xs text-status-warning">Pick at least one project, or this person can&apos;t fill a Sole Selling report.</p>
      )}
    </div>
  );
}
