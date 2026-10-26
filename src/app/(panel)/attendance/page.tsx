"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loading, PageHeader, Tabs } from "@/components/ui/page";
import { AttUpdateBanner } from "@/components/attendance/att-update-banner";
import { useSession } from "@/context/session-context";
import { AttendanceList, SalarySheet } from "@/components/attendance/att-manage";
import { AttendanceUpload } from "@/components/attendance/att-upload";

type Tab = "list" | "upload" | "salary" | "mine";

function AttendanceInner() {
  const { isManager, user } = useSession();
  const isAdmin = user?.role === "Admin";
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();

  // Admin has no attendance of their own; HR also sees their own days.
  const tabs: { value: Tab; label: string; short?: string }[] = isManager ? [
    { value: "list", label: "Attendance" },
    { value: "upload", label: "Upload" },
    ...(isAdmin ? [{ value: "salary" as Tab, label: "Salary sheet", short: "Salary" }] : [{ value: "mine" as Tab, label: "My attendance", short: "Mine" }]),
  ] : [];
  const requested = q.get("tab") as Tab | null;
  const tab: Tab = !isManager ? "mine" : requested && tabs.some((t) => t.value === requested) ? requested : "list";

  const subtitle = {
    list: "One row per person per day. Tap a row to change it.",
    upload: "eTimeOffice report or the upload template. Preview first, then import.",
    salary: "Salary sheet",
    mine: "Late after 10:30 (first 2 a month free, then ½ day each). Under 8 hours = ½ day.",
  }[tab];

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Attendance" subtitle={subtitle} />
      {tabs.length > 0 && <Tabs tabs={tabs} value={tab} onChange={(t) => router.replace(`${pathname}?tab=${t}`)} />}
      {tab === "list" && <AttendanceList key={`${q.get("emp")}${q.get("month")}`} manager initialEmp={q.get("emp") ?? ""} initialMonth={/^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : undefined} />}
      {tab === "mine" && <><AttUpdateBanner /><AttendanceList key={`mine${q.get("month")}`} manager={false} initialMonth={/^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : undefined} /></>}
      {tab === "upload" && <AttendanceUpload />}
      {tab === "salary" && isAdmin && <SalarySheet />}
    </div>
  );
}

export default function AttendancePage() {
  return <Suspense fallback={<Loading />}><AttendanceInner /></Suspense>;
}
