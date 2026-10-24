"use client";

import { useParams } from "next/navigation";
import { ReportFormPage } from "@/components/reports/report-form-page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";

export default function EditReportPage() {
  const { id } = useParams<{ id: string }>();
  const { isManager } = useSession();
  return <ReportFormPage backHref={isManager ? "/reports?tab=team" : "/reports"} load={() => api.reportForm({ reportId: id })} />;
}
