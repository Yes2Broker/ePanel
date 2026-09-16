import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  Present: "bg-status-successBg text-status-success",
  Completed: "bg-status-successBg text-status-success",
  Submitted: "bg-status-successBg text-status-success",
  Approved: "bg-status-successBg text-status-success",
  Active: "bg-status-successBg text-status-success",
  "On Track": "bg-status-warningBg text-status-warning",
  Late: "bg-status-warningBg text-status-warning",
  Pending: "bg-status-warningBg text-status-warning",
  Draft: "bg-status-warningBg text-status-warning",
  Absent: "bg-status-dangerBg text-status-danger",
  Inactive: "bg-status-dangerBg text-status-danger",
  Leave: "bg-status-neutralBg text-ink-muted",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[status] || "bg-status-neutralBg text-ink-muted")}>
      {status}
    </span>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-status-dangerBg text-status-danger",
  Medium: "bg-status-warningBg text-status-warning",
  Low: "bg-status-neutralBg text-ink-muted",
};

export function PriorityPill({ priority }: { priority: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_STYLES[priority])}>
      {priority}
    </span>
  );
}
