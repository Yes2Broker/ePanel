import { AttDay, AttStatus } from "@/types";
import { cn } from "@/lib/utils";

export const STATUS_STYLE: Record<AttStatus, string> = {
  Present: "bg-status-successBg text-status-success",
  Absent: "bg-status-dangerBg text-status-danger",
  Weekoff: "bg-status-neutralBg text-ink-muted",
  "Paid Leave": "bg-brand-soft text-brand",
  Leave: "bg-status-warningBg text-status-warning",
  "Comp-off": "bg-brand-soft text-brand",
  "Missed punch": "border border-status-danger text-status-danger",
};

/** Short code for the calendar cells. */
export const STATUS_CODE: Record<AttStatus, string> = {
  Present: "P", Absent: "A", Weekoff: "W", "Paid Leave": "PL", Leave: "L", "Comp-off": "CO", "Missed punch": "MP",
};

export const ALL_STATUSES: AttStatus[] = ["Present", "Absent", "Weekoff", "Paid Leave", "Leave", "Comp-off", "Missed punch"];

export function AttPill({ status, className }: { status: AttStatus; className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status], className)}>{status}</span>;
}

/** 452 → "7:32". */
export const hours = (m: number | null) => (m == null ? "—" : `${m < 0 ? "-" : ""}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`);

/** Small flags after a day: Late / Late Half / Short Day / edited. */
export function DayFlags({ d }: { d: AttDay }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {d.lateHalf ? <Flag tone="danger">Late Half</Flag> : d.late && <Flag tone="warn">{d.shortDay ? "Late (counted as Short)" : "Late"}</Flag>}
      {d.shortDay && <Flag tone="danger">Short Day</Flag>}
      {d.edited && <Flag tone="muted">Edited by HR</Flag>}
    </span>
  );
}

function Flag({ tone, children }: { tone: "warn" | "danger" | "muted"; children: React.ReactNode }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-1.5 py-px text-[0.6875rem] font-medium",
      tone === "warn" ? "bg-status-warningBg text-status-warning" : tone === "danger" ? "bg-status-dangerBg text-status-danger" : "bg-status-neutralBg text-ink-muted")}>
      {children}
    </span>
  );
}
