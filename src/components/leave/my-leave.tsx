"use client";

import { useState } from "react";
import { Plus, CalendarOff } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { LeaveCard } from "@/components/leave/leave-card";
import { ApplyLeave } from "@/components/leave/apply-leave";

/** The employee's own leave: apply, and their requests (status + cancel). */
export function MyLeave() {
  const { data, loading, error, reload } = useApi(() => api.leaveOverview());
  const [applyOpen, setApplyOpen] = useState(false);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onRetry={reload} />
      {data.canApply ? (
        <PrimaryButton onClick={() => setApplyOpen(true)} className="w-full justify-center sm:w-auto"><Plus className="h-4 w-4" /> Apply for leave</PrimaryButton>
      ) : (
        <p className="rounded-xl bg-surface px-3 py-2 text-sm text-ink-muted">Leave is turned off for you. Contact HR or Admin.</p>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">My leave</h2>
        {data.applications.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No leave requests yet" />
        ) : data.applications.map((a) => <LeaveCard key={a.id} a={a} onChange={reload} />)}
      </section>
      <ApplyLeave open={applyOpen} onClose={() => setApplyOpen(false)} onDone={reload} />
    </div>
  );
}
