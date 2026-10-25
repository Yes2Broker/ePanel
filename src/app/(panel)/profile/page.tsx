"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/pills";
import { PrimaryButton } from "@/components/ui/button";
import { inputCls, Field } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { initials, formatINR, formatDate } from "@/lib/utils";
import { weekOffLabel } from "@/lib/constants";

function Row({ label, value, locked }: { label: string; value: React.ReactNode; locked?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-surface-border py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3">
      <span className="text-xs text-ink-faint sm:shrink-0 sm:text-sm">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink [overflow-wrap:anywhere] sm:text-right">
        {value || "—"} {locked && <Lock className="h-3 w-3 shrink-0 text-ink-faint" />}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useSession();
  if (!user) return null;

  return (
    <div className="max-w-3xl space-y-4 pt-1 md:space-y-6 md:pt-4">
      <PageHeader title="My Profile" subtitle="Contact HR or Admin to update these details." />

      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-base font-medium text-white sm:h-16 sm:w-16 sm:text-lg">
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-ink-faint">{[user.designation, user.department].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">Personal Information</h3>
        <div className="mt-2">
          <Row label="Full Name" value={user.name} locked />
          <Row label="Employee ID" value={user.id} locked />
          <Row label="Email" value={user.email} locked />
          <Row label="Mobile Number" value={user.mobile} locked />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-1 text-sm font-semibold text-ink">Employment Information</h3>
        <div className="mt-2">
          <Row label="Department" value={user.department} locked />
          <Row label="Designation" value={user.designation} locked />
          <Row label="Role" value={user.role} locked />
          <Row label="Date of Joining" value={user.joiningDate ? formatDate(user.joiningDate) : ""} locked />
          <Row label="Salary" value={formatINR(user.salary)} locked />
          <Row label="Reporting Manager" value={user.manager} locked />
          <Row label="Weekly Off" value={weekOffLabel(user.weekOff)} locked />
          <Row label="Employment Status" value={<StatusPill status={user.status} />} />
        </div>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("The new passwords don't match.");
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      toast("Password changed. Other devices have been signed out.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-ink">Change Password</h3>
      <p className="mt-0.5 text-xs text-ink-faint">Forgot your current password? HR or Admin can reset it for you.</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
        </Field>
        <Field label="New password">
          <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-3">
          <p className="text-xs text-status-danger" role="alert">{error}</p>
          <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Update password"}</PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
