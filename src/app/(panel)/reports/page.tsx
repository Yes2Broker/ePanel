"use client";

import { useState } from "react";
import { FileText, TrendingUp, Eye, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { reportsInitial } from "@/data/reports";
import { DailyReport } from "@/types";

export default function ReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>(reportsInitial);
  const remove = (id: string) => setReports(reports.filter((r) => r.id !== id));

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">Daily Reports</h1>
        <p className="mt-0.5 text-sm text-ink-faint">Choose a report type to fill in, or review past submissions.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand">
            <FileText className="h-4 w-4 text-ink" />
          </div>
          <h3 className="text-sm font-semibold text-ink">Normal Daily Report</h3>
          <p className="mt-1 text-sm text-ink-faint">Log your day-to-day activity, visits and follow-ups.</p>
          <SecondaryButton className="mt-4">Fill Report</SecondaryButton>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand">
            <TrendingUp className="h-4 w-4 text-ink" />
          </div>
          <h3 className="text-sm font-semibold text-ink">Sole Selling Daily Report</h3>
          <p className="mt-1 text-sm text-ink-faint">Log activity specific to sole-selling assigned projects.</p>
          <SecondaryButton className="mt-4">Fill Report</SecondaryButton>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">My Past Reports</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-2 py-2.5">Date</th>
                <th className="px-2 py-2.5">Report Type</th>
                <th className="px-2 py-2.5">Status</th>
                <th className="px-2 py-2.5">Last Updated</th>
                <th className="px-2 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-2 py-2.5 text-ink">{r.date}</td>
                  <td className="px-2 py-2.5 text-ink-muted">{r.type}</td>
                  <td className="px-2 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-2 py-2.5 text-ink-faint">{r.updated}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted"><Eye className="h-3.5 w-3.5" /></button>
                      <button className="rounded-lg p-1.5 text-ink-faint hover:bg-surface hover:text-ink-muted"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(r.id)} className="rounded-lg p-1.5 text-ink-faint hover:bg-status-dangerBg hover:text-status-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
