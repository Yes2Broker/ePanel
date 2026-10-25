"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loading, PageHeader, Tabs } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { todayISO } from "@/lib/utils";
import { MonthView } from "@/components/attendance/month-view";
import { DAY_FILTERS, DayFilter, MissedPunches, SalarySheet, TeamDay, TeamMonth } from "@/components/attendance/att-manage";
import { AttendanceUpload } from "@/components/attendance/att-upload";

type Tab = "day" | "month" | "missed" | "upload" | "salary" | "mine";

function AttendanceInner() {
  const { isManager, user } = useSession();
  const isAdmin = user?.role === "Admin";
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  // The last uploaded day (default for the Day tab) and the missed-punch count.
  const dash = useApi(() => (isManager ? api.attDashboard() : Promise.resolve(null)));
  const missed = useApi(() => (isManager ? api.attMissed() : Promise.resolve(null)));

  const tabs: { value: Tab; label: string; short?: string; count?: number }[] = isManager ? [
    { value: "day", label: "By day", short: "Day" },
    { value: "month", label: "By month", short: "Month" },
    { value: "missed", label: "Missed punch", short: "Missed", count: missed.data?.length ?? 0 },
    { value: "upload", label: "Upload" },
    ...(isAdmin ? [{ value: "salary" as Tab, label: "Salary sheet", short: "Salary" }] : []),
    { value: "mine", label: "My attendance", short: "Mine" },
  ] : [];
  const requested = q.get("tab") as Tab | null;
  const tab: Tab = !isManager ? "mine" : requested && tabs.some((t) => t.value === requested) ? requested : "day";
  const month = /^\d{4}-\d{2}$/.test(q.get("month") ?? "") ? q.get("month")! : todayISO().slice(0, 7);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") ?? "") ? q.get("date")! : dash.data?.team?.date ?? todayISO();
  const rawFilter = (q.get("filter") ?? "") as DayFilter;
  const filter: DayFilter = DAY_FILTERS.includes(rawFilter) ? rawFilter : "";

  const go = (params: Record<string, string>) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    router.replace(`${pathname}?${sp.toString()}`);
  };
  const setTab = (t: Tab) => go({ tab: t });

  const subtitle = {
    day: "Everyone on one day. Tap the pencil to fix a day.",
    month: "Month totals per person. Tap someone for their calendar.",
    missed: "Only an In or only an Out. Not counted until fixed.",
    upload: "eTimeOffice report or the upload template. Preview first, then import.",
    salary: "Monthly salary ÷ days in month × net payable days. Admin only.",
    mine: "Late after 10:30 (first 2 a month free, then ½ day each). Under 8 hours = ½ day.",
  }[tab];

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Attendance" subtitle={subtitle} />
      {tabs.length > 0 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === "mine" && <MonthView employeeId={null} month={month} onMonth={(m) => go({ tab: isManager ? "mine" : "", month: m })} />}
      {tab === "day" && (isManager && dash.loading && !dash.data && !q.get("date") ? <Loading /> :
        <TeamDay date={date} filter={filter} onChange={(d, f) => go({ tab: "day", date: d, filter: f })} />)}
      {tab === "month" && <TeamMonth month={month} person={q.get("emp") ?? ""} onChange={(m, p) => go({ tab: "month", month: m, emp: p })} />}
      {tab === "missed" && <MissedPunches onChange={missed.reload} />}
      {tab === "upload" && <AttendanceUpload onImported={() => { dash.reload(); missed.reload(); }} />}
      {tab === "salary" && isAdmin && <SalarySheet />}
    </div>
  );
}

export default function AttendancePage() {
  return <Suspense fallback={<Loading />}><AttendanceInner /></Suspense>;
}
