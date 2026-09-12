import { MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Employee } from "@/types";
import { initials } from "@/lib/utils";

export function TopPerformers({ employees }: { employees: Employee[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Top Performers</h3>
        <button className="text-xs font-medium text-ink-muted hover:text-ink">See all</button>
      </div>
      <ul className="space-y-1">
        {employees.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">
              {initials(e.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{e.name}</p>
              <p className="truncate text-xs text-ink-faint">{e.designation}</p>
            </div>
            <button className="rounded-lg p-1.5 text-ink-faint hover:bg-white hover:text-ink-muted">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
