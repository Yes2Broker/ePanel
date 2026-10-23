"use client";

import { useState } from "react";
import { Plus, CalendarOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorBanner, Loading, PageHeader, Tabs, selectCls, tableHeadCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { RequestLeaveDialog, ReviewLeaveDialog } from "@/components/leave/leave-dialogs";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { LeaveRequest, LeaveStatus } from "@/types";
import { formatDate } from "@/lib/utils";

type View = "mine" | "approvals";

export default function LeavePage() {
  const { isManager } = useSession();
  const [view, setView] = useState<View>("mine");
  const [requestOpen, setRequestOpen] = useState(false);
  const pending = useApi(() => (isManager ? api.listLeaveRequests("Pending") : Promise.resolve([])), [isManager]);

  return (
    <div className="space-y-5 pt-4">
      <PageHeader
        title="Leave"
        subtitle={view === "approvals" ? "Approve or reject your team's leave requests." : "Request time off and track your requests."}
        actions={view === "mine" && <PrimaryButton onClick={() => setRequestOpen(true)}><Plus className="h-4 w-4" /> Request leave</PrimaryButton>}
      />
      {isManager && (
        <Tabs
          value={view}
          onChange={setView}
          tabs={[{ value: "mine", label: "My leave" }, { value: "approvals", label: "Approvals", count: pending.data?.length }]}
        />
      )}
      {view === "mine" ? (
        <MyLeave requestOpen={requestOpen} setRequestOpen={setRequestOpen} />
      ) : (
        <Approvals onChanged={pending.reload} />
      )}
    </div>
  );
}

function MyLeave({ requestOpen, setRequestOpen }: { requestOpen: boolean; setRequestOpen: (v: boolean) => void }) {
  const toast = useToast();
  const { data, setData, loading, error, reload } = useApi(() => api.myLeaves());
  const [saving, setSaving] = useState(false);

  const request = async (v: { type: LeaveRequest["type"]; start: string; end: string; reason: string }) => {
    setSaving(true);
    try {
      await api.requestLeave(v.type, v.start, v.end, v.reason);
      toast("Leave request sent.");
      setRequestOpen(false);
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (l: LeaveRequest) => {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await api.cancelLeave(l.id);
      setData((data ?? []).map((x) => (x.id === l.id ? { ...x, status: "Cancelled" } : x)));
      toast("Request cancelled.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length === 0 ? (
        <EmptyState icon={CalendarOff} title="No leave requests yet" text="When you need time off, request it here and HR will see it in their approvals." />
      ) : (
        <Card className="overflow-hidden p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Dates</th>
                  <th className="px-2 py-2.5">Type</th>
                  <th className="px-2 py-2.5">Days</th>
                  <th className="px-2 py-2.5">Reason</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink">{formatDate(l.startDate)} – {formatDate(l.endDate)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{l.type}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{l.days}</td>
                    <td className="max-w-xs px-2 py-2.5 text-ink-muted"><p className="truncate">{l.reason}</p></td>
                    <td className="px-2 py-2.5">
                      <StatusPill status={l.status} />
                      {l.reviewNote && <p className="mt-0.5 text-xs text-ink-faint">“{l.reviewNote}” — {l.reviewedBy}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {l.status === "Pending" && (
                        <button onClick={() => cancel(l)} className="text-xs font-medium text-ink-muted hover:text-status-danger">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <RequestLeaveDialog open={requestOpen} onClose={() => setRequestOpen(false)} onSave={request} saving={saving} />
    </>
  );
}

function Approvals({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { user } = useSession();
  const [status, setStatus] = useState<LeaveStatus | "All">("Pending");
  const { data, loading, error, reload } = useApi(() => api.listLeaveRequests(status === "All" ? null : status), [status]);
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const review = async (approve: boolean, note: string) => {
    if (!reviewing) return;
    setSaving(true);
    try {
      await api.reviewLeave(reviewing.id, approve, note);
      toast(`Leave ${approve ? "approved" : "rejected"} for ${reviewing.employeeName}.`);
      setReviewing(null);
      reload();
      onChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <select value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | "All")} className={selectCls}>
          {["Pending", "Approved", "Rejected", "Cancelled", "All"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <ErrorBanner message={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data?.length === 0 ? (
        <EmptyState icon={CalendarOff} title={status === "Pending" ? "Nothing waiting for review" : "No requests"} />
      ) : (
        <Card className="overflow-hidden p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-2 py-2.5">Employee</th>
                  <th className="px-2 py-2.5">Dates</th>
                  <th className="px-2 py-2.5">Type</th>
                  <th className="px-2 py-2.5">Days</th>
                  <th className="px-2 py-2.5">Status</th>
                  <th className="px-2 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={l.employeeName} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{l.employeeName}</p>
                          <p className="max-w-[16rem] truncate text-xs text-ink-faint">{l.reason}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-ink-muted">{formatDate(l.startDate)} – {formatDate(l.endDate)}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{l.type}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{l.days}</td>
                    <td className="px-2 py-2.5">
                      <StatusPill status={l.status} />
                      {l.reviewedBy && <p className="mt-0.5 text-xs text-ink-faint">by {l.reviewedBy}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {l.status === "Pending" && l.employeeId !== user?.id && (
                        <button onClick={() => setReviewing(l)} className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-ink/90">Review</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <ReviewLeaveDialog request={reviewing} onClose={() => setReviewing(null)} onReview={review} saving={saving} />
    </>
  );
}
