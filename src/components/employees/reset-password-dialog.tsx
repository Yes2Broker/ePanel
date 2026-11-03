"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { copyLoginDetails } from "@/lib/login-details";
import type { Employee } from "@/types";
import { PasswordInput } from "@/components/ui/password-input";

export function ResetPasswordDialog({
  open, onClose, onSave, employee, saving,
}: { open: boolean; onClose: () => void; onSave: (newPassword: string) => Promise<boolean>; employee: Employee | null; saving?: boolean }) {
  const employeeName = employee?.name ?? "";
  const toast = useToast();
  // The new password lives only here, until the dialog closes.
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { if (open) { setPassword(""); setDone(false); } }, [open]);

  if (done && employee) {
    return (
      <Modal open={open} onClose={onClose} title={`Password set — ${employeeName}`}>
        <p className="text-sm text-ink">The new password is saved. Copy the login details to send them to {employeeName.split(" ")[0]}.</p>
        <div className="grid grid-cols-2 gap-2 pt-4 sm:flex sm:justify-end">
          <SecondaryButton type="button" onClick={onClose} className="justify-center">Close</SecondaryButton>
          <PrimaryButton type="button" className="justify-center" onClick={() => copyLoginDetails(employee, password).then(() => toast("Copied"), () => toast("Couldn't copy. Allow clipboard access.", "error"))}>
            <Copy className="h-4 w-4" /> Copy login details
          </PrimaryButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reset password — ${employeeName}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password.trim()) return;
          onSave(password).then((ok) => { if (ok) setDone(true); });
        }}
        className="space-y-4"
      >
        <Field label="New Password">
          <PasswordInput required autoFocus minLength={8} autoCapitalize="none" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
        </Field>
        <p className="text-xs text-ink-faint">Share this new password with the employee directly. They'll be signed out of every device.</p>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
          <SecondaryButton type="button" onClick={onClose} className="justify-center">Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving} className="justify-center">{saving ? "Saving…" : "Set new password"}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
