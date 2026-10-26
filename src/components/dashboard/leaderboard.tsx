"use client";

import Link from "next/link";
import { useState } from "react";
import { Medal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MonthPicker, monthLabel } from "@/components/attendance/month-view";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { todayISO } from "@/lib/utils";

const MEDAL = ["text-[#C9A227]", "text-[#9AA3AE]", "text-[#B87333]"];

/** HR/Admin dashboard: top 3 for Calls, Visits done and Tokens in a month. */
export function Leaderboard() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data, loading } = useApi(() => api.reportLeaderboard(month), [month]);
  const groups = [["Calls", data?.calls], ["Visits done", data?.done], ["Tokens", data?.tokens]] as const;
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Top performers – {monthLabel(month)}</h3>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {groups.map(([label, rows]) => (
          <section key={label} aria-label={`Top ${label}`}>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</h4>
            {loading && !data ? <p className="py-2 text-sm text-ink-faint">Loading…</p> : !rows?.length ? (
              <p className="py-2 text-sm text-ink-faint">No reports yet.</p>
            ) : (
              <ol className="space-y-0.5">
                {rows.map((r, i) => (
                  <li key={r.id}>
                    <Link href={`/reports?tab=reports&emp=${r.id}&month=${month}`}
                      className="flex min-h-10 items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface">
                      <Medal className={`h-4 w-4 shrink-0 ${MEDAL[i]}`} aria-label={`${i + 1}`} />
                      <span className="min-w-0 flex-1 break-words text-sm text-ink">{r.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-ink">{r.value}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </Card>
  );
}
