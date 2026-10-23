"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmployeeStat } from "@/types";

export function PerformanceTable({ rows }: { rows: EmployeeStat[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.employee.name.toLowerCase().includes(q) || r.employee.department.toLowerCase().includes(q)) : rows;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Employee Overview</h3>
          <p className="text-xs text-ink-faint">This month</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-40 rounded-pill border border-surface-border bg-surface py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <th className="pb-2.5 pr-3">Employee</th>
              <th className="pb-2.5 pr-3">Attendance</th>
              <th className="pb-2.5 pr-3">Reports</th>
              <th className="pb-2.5 pr-3">Tasks done</th>
              <th className="pb-2.5">Today</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.employee.id} className="border-t border-surface-border">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.employee.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{r.employee.name}</p>
                      <p className="truncate text-xs text-ink-faint">{r.employee.department}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  {r.attendanceRate == null ? <span className="text-ink-faint">—</span> : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-status-neutralBg">
                        <div className="h-full rounded-full bg-brand-dark" style={{ width: `${r.attendanceRate}%` }} />
                      </div>
                      <span className="text-ink-muted">{r.attendanceRate}%</span>
                    </div>
                  )}
                </td>
                <td className="py-3 pr-3 text-ink-muted">{r.reportsThisMonth}</td>
                <td className="py-3 pr-3 text-ink-muted">{r.tasksCompleted}</td>
                <td className="py-3">
                  <span className={r.checkedInToday ? "text-xs font-medium text-status-success" : "text-xs text-ink-faint"}>
                    {r.checkedInToday ? "Checked in" : "Not in"}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-ink-faint">No matching employees.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
