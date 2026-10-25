import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmployeeStat } from "@/types";

/** Best attendance this month. */
export function TopPerformers({ stats }: { stats: EmployeeStat[] }) {
  const top = stats.filter((s) => s.attendanceRate != null).slice(0, 5);
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Top Attendance</h3>
        <span className="text-xs text-ink-faint">This month</span>
      </div>
      {top.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">No attendance recorded yet this month.</p>
      ) : (
        <ul className="space-y-1">
          {top.map((s) => (
            <li key={s.employee.id} className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface">
              <Avatar name={s.employee.name} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{s.employee.name}</p>
                <p className="truncate text-xs text-ink-faint">{s.employee.designation || s.employee.department}</p>
              </div>
              <span className="text-sm font-semibold text-ink">{s.attendanceRate}%</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
