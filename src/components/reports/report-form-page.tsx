"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ErrorBanner, Loading } from "@/components/ui/page";
import { ReportForm } from "@/components/reports/report-form";
import { ReportSummary } from "@/components/reports/report-summary";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { ReportFormData, SalesReportDetail } from "@/types";
import { getCarry, loadDraft, removeDraft, saveDraft, setCarry } from "@/lib/report-draft";
import { longDate } from "@/lib/report-format";

/** Loads the form (new or edit), then shows the summary popup after saving. */
export function ReportFormPage({ load, backHref, depKey = "", onDateChange }: {
  load: () => Promise<ReportFormData>; backHref: string; depKey?: string; onDateChange?: (d: string) => void;
}) {
  const router = useRouter();
  const { isManager } = useSession();
  const { data, loading, error, reload } = useApi(load, [depKey]);
  const [saved, setSaved] = useState<SalesReportDetail | null>(null);

  // The typed values were just moved to a date that's already filed: stay, keep them, offer Edit / go back.
  const carry = data?.existingReportId ? getCarry() : null;
  // Someone already filed this one: open it instead of a blank form.
  useEffect(() => {
    if (data?.existingReportId && !carry) router.replace(`/reports?open=${data.existingReportId}`);
  }, [data, router, carry]);
  const goBack = () => {
    if (!carry || !onDateChange) return;
    const d = loadDraft(carry.toKey);
    if (d) saveDraft(carry.fromKey, d);
    removeDraft(carry.toKey);
    setCarry({ fromKey: carry.toKey, toKey: carry.fromKey, fromDate: carry.fromDate });
    onDateChange(carry.fromDate);
  };

  return (
    <div className="pt-2">
      <Link href={backHref} className="mb-1 inline-flex min-h-11 items-center gap-1 text-sm text-ink-muted hover:text-ink md:mb-3 md:min-h-0">
        <ArrowLeft className="h-4 w-4" /> Daily Reports
      </Link>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data?.existingReportId && carry && (
        <div role="alert" className="mx-auto max-w-xl space-y-3 rounded-card border border-status-warning/30 bg-status-warningBg p-4 text-sm text-status-warning">
          <p className="font-semibold">Already filled — use Edit</p>
          <p className="text-ink-muted">A report for this date is already filed. What you typed is kept.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/reports/edit/${data.existingReportId}`} className="inline-flex min-h-10 items-center rounded-xl border border-surface-border bg-white px-3 font-medium text-ink">Edit that report</Link>
            <button type="button" onClick={goBack} className="inline-flex min-h-10 items-center rounded-xl bg-brand px-3 font-medium text-white">Back to {longDate(carry.fromDate)}</button>
          </div>
        </div>
      )}
      {data && !data.existingReportId && !saved && (
        <ReportForm key={data.date} form={data} isManager={isManager} onSaved={setSaved} onDateChange={onDateChange} />
      )}
      {saved && (
        <ReportSummary
          report={saved}
          showHistory={isManager}
          onClose={() => router.push(backHref)}
        />
      )}
    </div>
  );
}
