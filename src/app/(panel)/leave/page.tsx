"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loading, PageHeader, Tabs } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { MyLeave } from "@/components/leave/my-leave";
import { LeaveRequests } from "@/components/leave/leave-manage";

type Tab = "requests" | "mine";

/**
 * Leave is a request + approval only; it never changes Attendance.
 * Admin: Requests only. HR: Requests + My leave (decided by Admin).
 * Everyone else: Apply + My leave.
 */
function LeaveInner() {
  const { isManager, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const q = useSearchParams();
  if (!user) return <Loading />;
  const isAdmin = user.role === "Admin";
  const tab: Tab = isAdmin || (isManager && q.get("tab") !== "mine") ? "requests" : "mine";
  const subtitle = tab === "requests"
    ? "Approve or reject leave. Warnings flag weekends, projects left uncovered and busy days."
    : isManager ? "Your leave requests go to Admin for approval." : undefined;
  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Leave" subtitle={subtitle} />
      {isManager && !isAdmin && (
        <Tabs tabs={[{ value: "requests", label: "Requests" }, { value: "mine", label: "My leave" }]} value={tab}
          onChange={(t: Tab) => router.replace(`${pathname}?tab=${t}`)} />
      )}
      {tab === "requests" ? <LeaveRequests /> : <MyLeave />}
    </div>
  );
}

export default function LeavePage() {
  return <Suspense fallback={<Loading />}><LeaveInner /></Suspense>;
}
