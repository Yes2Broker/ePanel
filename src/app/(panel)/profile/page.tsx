"use client";

import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/pills";
import { useSession } from "@/context/session-context";
import { initials, formatINR } from "@/lib/utils";

function Row({ label, value, locked }: { label: string; value: React.ReactNode; locked?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-border py-3 last:border-0">
      <span className="text-sm text-ink-faint">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
        {value} {locked && <Lock className="h-3 w-3 text-ink-faint" />}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <div className="max-w-3xl space-y-6 pt-4">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">My Profile</h1>
        <p className="mt-0.5 text-sm text-ink-faint">View-only. Contact HR or Admin to update these details.</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-lg font-medium text-white">
            {initials(user.name)}
          </div>
          <div>
            <p className="text-base font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-ink-faint">{user.designation} · {user.department}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">Personal Information</h3>
        <div className="mt-2">
          <Row label="Full Name" value={user.name} />
          <Row label="Employee ID" value={user.id} locked />
          <Row label="Email" value={user.email} locked />
          <Row label="Mobile Number" value={user.mobile} />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">Employment Information</h3>
        <div className="mt-2">
          <Row label="Department" value={user.department} locked />
          <Row label="Designation" value={user.designation} />
          <Row label="Role" value={user.role} locked />
          <Row label="Date of Joining" value={user.joiningDate} locked />
          <Row label="Salary" value={formatINR(user.salary)} locked />
          <Row label="Reporting Manager" value={user.manager} />
          <Row label="Employment Status" value={<StatusPill status={user.status} />} />
        </div>
      </Card>
    </div>
  );
}
