import { Search, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/pills";
import { Employee } from "@/types";
import { initials } from "@/lib/utils";

interface Row {
  employee: Employee;
  attendancePct: number;
  tasksDone: number;
  reviewDate: string;
  status: "Completed" | "On Track";
}

export function PerformanceTable({ rows }: { rows: Row[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Employee Performance</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input placeholder="Search…" className="w-40 rounded-pill border border-surface-border bg-surface py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <button className="rounded-full border border-surface-border p-1.5 text-ink-faint hover:text-ink-muted">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <th className="pb-2.5 pr-3">Employee</th>
              <th className="pb-2.5 pr-3">Attendance</th>
              <th className="pb-2.5 pr-3">Tasks Done</th>
              <th className="pb-2.5 pr-3">Progress</th>
              <th className="pb-2.5 pr-3">Review Date</th>
              <th className="pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id} className="border-t border-surface-border">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">
                      {initials(r.employee.name)}
                    </div>
                    <span className="font-medium text-ink">{r.employee.name}</span>
                  </div>
                </td>
                <td className="py-3 pr-3 text-ink-muted">{r.attendancePct}%</td>
                <td className="py-3 pr-3 text-ink-muted">{r.tasksDone}%</td>
                <td className="py-3 pr-3">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-status-neutralBg">
                    <div className="h-full rounded-full bg-brand-dark" style={{ width: `${r.tasksDone}%` }} />
                  </div>
                </td>
                <td className="py-3 pr-3 text-ink-muted">{r.reviewDate}</td>
                <td className="py-3"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
