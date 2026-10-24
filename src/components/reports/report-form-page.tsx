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

/** Loads the form (new or edit), then shows the summary popup after saving. */
export function ReportFormPage({ load, backHref }: { load: () => Promise<ReportFormData>; backHref: string }) {
  const router = useRouter();
  const { isManager } = useSession();
  const { data, loading, error, reload } = useApi(load);
  const [saved, setSaved] = useState<SalesReportDetail | null>(null);

  // Someone already filed this one today: open it instead of a blank form.
  useEffect(() => {
    if (data?.existingReportId) router.replace(`/reports?open=${data.existingReportId}`);
  }, [data, router]);

  return (
    <div className="pt-2">
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Daily Reports
      </Link>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && !data.existingReportId && !saved && (
        <ReportForm form={data} isManager={isManager} onSaved={setSaved} />
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
