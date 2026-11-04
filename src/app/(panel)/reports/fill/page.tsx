"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReportFormPage } from "@/components/reports/report-form-page";
import { Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { SalesReportType } from "@/types";

function Fill() {
  const q = useSearchParams();
  const type = (q.get("type") === "sole" ? "Sole Selling" : "Normal") as SalesReportType;
  const employeeId = q.get("employee");
  const router = useRouter();
  const pathname = usePathname();
  // Changing the report date reloads the form for that day (?date=YYYY-MM-DD).
  const setDate = (d: string) => { const n = new URLSearchParams(q.toString()); n.set("date", d); router.replace(`${pathname}?${n}`); };
  return (
    <ReportFormPage
      backHref="/reports"
      depKey={q.toString()}
      onDateChange={setDate}
      load={() => api.reportForm({ type, projectId: q.get("project"), date: q.get("date"), employeeId })}
    />
  );
}

export default function FillReportPage() {
  return <Suspense fallback={<Loading />}><Fill /></Suspense>;
}
