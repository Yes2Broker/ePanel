"use client";

import { ChevronDown, CheckCircle2, AlertCircle, X, CalendarCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { StatusPill } from "@/components/ui/pills";
import { attendanceRows } from "@/data/attendance";

export default function AttendancePage() {
  const counts = attendanceRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold text-ink">Attendance</h1>
          <p className="mt-0.5 text-sm text-ink-faint">View only. Contact HR for corrections.</p>
        </div>
        <button className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-ink-muted shadow-card">
          September 2026 <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard icon={CheckCircle2} label="Present" value={counts.Present || 0} />
        <SummaryCard icon={AlertCircle} label="Late" value={counts.Late || 0} />
        <SummaryCard icon={X} label="Absent" value={counts.Absent || 0} />
        <SummaryCard icon={CalendarCheck} label="Leave" value={counts.Leave || 0} />
      </div>

      <Card className="overflow-hidden p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-2.5">Date</th>
                <th className="px-2 py-2.5">Check In</th>
                <th className="px-2 py-2.5">Check Out</th>
                <th className="px-2 py-2.5">Working Hours</th>
                <th className="px-2 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((r) => (
                <tr key={r.date} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-2 py-2.5 text-ink">{r.date}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{r.checkIn}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{r.checkOut}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{r.hours}</td>
                  <td className="px-2 py-2.5"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
