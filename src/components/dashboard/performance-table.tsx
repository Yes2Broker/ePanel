"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Employee, EmployeeStat } from "@/types";
import { isFeatureEnabled } from "@/lib/features";

// Stats columns appear only once their feature is launched (src/lib/features.ts).
const showAttendance = isFeatureEnabled("attendance");
const showReports = isFeatureEnabled("reports");

/** Active employees, plus this month's stats for whichever features are live. */
export function PerformanceTable({ employees, stats }: { employees: Employee[]; stats?: EmployeeStat[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const byId = new Map((stats ?? []).map((s) => [s.employee.id, s]));
  const visible = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    : employees;
  const hasStats = showAttendance || showReports;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Employee Overview</h3>
          <p className="text-xs text-ink-faint">{hasStats ? "This month" : `${employees.length} active`}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="w-40 rounded-pill border border-surface-border bg-surface py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <Link href="/admin/employees" className="text-xs font-medium text-ink-muted hover:text-ink">Manage</Link>
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              <th className="pb-2.5 pr-3">Employee</th>
              <th className="pb-2.5 pr-3">Role</th>
              <th className="pb-2.5 pr-3">Mobile</th>
              {showAttendance && <th className="pb-2.5 pr-3">Attendance</th>}
              {showReports && <th className="pb-2.5 pr-3">Reports</th>}
              {showAttendance && <th className="pb-2.5">Today</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const s = byId.get(e.id);
              return (
                <tr key={e.id} className="border-t border-surface-border">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={e.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{e.name}</p>
                        <p className="truncate text-xs text-ink-faint">{e.id} · {e.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-ink-muted">{e.role}</td>
                  <td className="whitespace-nowrap py-3 pr-3 text-ink-muted">{e.mobile || "—"}</td>
                  {showAttendance && (
                    <td className="py-3 pr-3">
                      {s?.attendanceRate == null ? <span className="text-ink-faint">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-status-neutralBg">
                            <div className="h-full rounded-full bg-brand-dark" style={{ width: `${s.attendanceRate}%` }} />
                          </div>
                          <span className="text-ink-muted">{s.attendanceRate}%</span>
                        </div>
                      )}
                    </td>
                  )}
                  {showReports && <td className="py-3 pr-3 text-ink-muted">{s?.reportsThisMonth ?? "—"}</td>}
                  {showAttendance && (
                    <td className="py-3">
                      <span className={s?.checkedInToday ? "text-xs font-medium text-status-success" : "text-xs text-ink-faint"}>
                        {s?.checkedInToday ? "Checked in" : "Not in"}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-ink-faint">No matching employees.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
