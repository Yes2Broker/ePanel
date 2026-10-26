"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { attUpdatesChanged, useAttUpdates } from "@/lib/att-updates";
import { monthLabel } from "@/components/attendance/month-view";

/**
 * "Your October 2026 attendance has been updated. Please check it." — one per
 * updated month. On the dashboards it links to that month ("View attendance");
 * only the Attendance page has "Mark as checked", which is what clears it.
 */
export function AttUpdateBanner({ where = "attendance", href }: { where?: "dashboard" | "attendance"; href?: (month: string) => string }) {
  const toast = useToast();
  const { data } = useAttUpdates();
  const [busy, setBusy] = useState("");
  if (!data?.length) return null;
  const mark = async (month: string) => {
    setBusy(month);
    try {
      await api.attMarkChecked(month);
      toast(`${monthLabel(month)} marked as checked.`);
      attUpdatesChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="space-y-2">
      {data.map((u) => (
        <div key={u.month} role="status" className="flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-soft px-4 py-3">
          <RefreshCw className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <p className="min-w-[14rem] flex-1 text-sm text-ink">Your <b className="font-semibold">{monthLabel(u.month)}</b> attendance has been updated. Please check it.</p>
          {where === "dashboard" ? (
            <Link href={href ? href(u.month) : `/attendance?month=${u.month}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90">
              View attendance <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <PrimaryButton onClick={() => mark(u.month)} disabled={busy === u.month} className="min-h-10 shrink-0">
              <Check className="h-4 w-4" /> {busy === u.month ? "Saving…" : "Mark as checked ✓"}
            </PrimaryButton>
          )}
        </div>
      ))}
    </div>
  );
}
