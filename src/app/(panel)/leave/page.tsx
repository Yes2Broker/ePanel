"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loading, PageHeader, Tabs } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { MyLeave } from "@/components/leave/my-leave";
import { LeaveRequests, CompOffClaims, HolidaysManager, LeaveSummary } from "@/components/leave/leave-manage";
import { LeaveCalendar } from "@/components/leave/leave-calendar";

type Tab = "requests" | "compoffs" | "calendar" | "holidays" | "summary" | "mine";

function LeaveInner() {
  const { isManager } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  // The pending count on the Requests tab (leave + comp-off claims this person may decide).
  const counts = useApi(() => (isManager ? api.leaveDashboard() : Promise.resolve(null)));

  const tabs: { value: Tab; label: string; short?: string; count?: number }[] = isManager ? [
    { value: "requests", label: "Requests", count: counts.data?.pendingApprovals ?? 0 },
    { value: "compoffs", label: "Comp-offs" },
    { value: "calendar", label: "Calendar" },
    { value: "holidays", label: "Holidays" },
    { value: "summary", label: "Monthly summary", short: "Summary" },
    { value: "mine", label: "My leave", short: "Mine" },
  ] : [];
  const requested = q.get("tab") as Tab | null;
  const tab: Tab = !isManager ? "mine" : requested && tabs.some((t) => t.value === requested) ? requested : "requests";
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`);

  const subtitle = {
    requests: "Approve or reject leave. Warnings flag weekends, projects left uncovered and busy days.",
    compoffs: "Comp-off claims for reports filed on a weekly off or holiday.",
    calendar: "Who's off each day.",
    holidays: "Company holidays never count as leave.",
    summary: "Unpaid leave per person, for salary.",
    mine: "All leave is unpaid. Comp-offs make a day paid.",
  }[tab];

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Leave" subtitle={subtitle} />
      {tabs.length > 0 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === "mine" && <MyLeave />}
      {tab === "requests" && <LeaveRequests onChange={counts.reload} />}
      {tab === "compoffs" && <CompOffClaims onChange={counts.reload} />}
      {tab === "calendar" && <LeaveCalendar />}
      {tab === "holidays" && <HolidaysManager />}
      {tab === "summary" && <LeaveSummary />}
    </div>
  );
}

export default function LeavePage() {
  return <Suspense fallback={<Loading />}><LeaveInner /></Suspense>;
}
