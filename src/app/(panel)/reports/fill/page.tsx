"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReportFormPage } from "@/components/reports/report-form-page";
import { Loading } from "@/components/ui/page";
import { api } from "@/lib/api";
import { SalesReportType } from "@/types";

function Fill() {
  const q = useSearchParams();
  const type = (q.get("type") === "sole" ? "Sole Selling" : "Normal") as SalesReportType;
  const employeeId = q.get("employee");
  return (
    <ReportFormPage
      backHref="/reports"
      load={() => api.reportForm({ type, projectId: q.get("project"), date: q.get("date"), employeeId })}
    />
  );
}

export default function FillReportPage() {
  return <Suspense fallback={<Loading />}><Fill /></Suspense>;
}
