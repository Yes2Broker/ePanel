"use client";

import { Loading, PageHeader } from "@/components/ui/page";
import { useSession } from "@/context/session-context";
import { MyLeave } from "@/components/leave/my-leave";
import { LeaveRequests } from "@/components/leave/leave-manage";

/**
 * Leave is a request + approval only; it never changes Attendance.
 * HR/Admin: Requests. Everyone else: Apply + My leave.
 */
export default function LeavePage() {
  const { isManager, user } = useSession();
  if (!user) return <Loading />;
  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <PageHeader title="Leave" subtitle={isManager ? "Approve or reject leave. Warnings flag weekends, projects left uncovered and busy days." : undefined} />
      {isManager ? <LeaveRequests /> : <MyLeave />}
    </div>
  );
}
