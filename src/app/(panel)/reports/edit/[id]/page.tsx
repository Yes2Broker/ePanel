"use client";

import { useParams } from "next/navigation";
import { ReportFormPage } from "@/components/reports/report-form-page";
import { api } from "@/lib/api";

export default function EditReportPage() {
  const { id } = useParams<{ id: string }>();
  return <ReportFormPage backHref="/reports" load={() => api.reportForm({ reportId: id })} />;
}
