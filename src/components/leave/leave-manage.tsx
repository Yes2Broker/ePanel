"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { LeaveCard } from "@/components/leave/leave-card";

const Segment = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) => (
  <div className="inline-flex rounded-full bg-white p-0.5 shadow-card" role="tablist">
    {options.map(([v, l]) => (
      <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
        className={cn("min-h-10 rounded-full px-3.5 text-sm font-medium", value === v ? "bg-ink text-white" : "text-ink-muted")}>{l}</button>
    ))}
  </div>
);

/** Leave requests for HR/Admin: pending (with warnings), upcoming, recent. */
export function LeaveRequests({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<"Pending" | "Upcoming" | "All">("Pending");
  const { data, loading, error, reload } = useApi(() => api.leaveQueue(status), [status]);
  const refresh = () => { reload(); onChange?.(); };
  return (
    <div className="space-y-3">
      <Segment value={status} onChange={setStatus} options={[["Pending", "Pending"], ["Upcoming", "Approved"], ["All", "Recent"]]} />
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
        <EmptyState icon={Inbox} title={status === "Pending" ? "No pending requests" : "Nothing here"} />
      ) : (data ?? []).map((a) => <LeaveCard key={a.id} a={a} showPerson onChange={refresh} />)}
    </div>
  );
}

