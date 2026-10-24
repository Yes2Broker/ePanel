"use client";

import { useEffect, useState } from "react";
import { Modal, Field, inputCls } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";

export function ResetPasswordDialog({
  open, onClose, onSave, employeeName, saving,
}: { open: boolean; onClose: () => void; onSave: (newPassword: string) => void; employeeName: string; saving?: boolean }) {
  const [password, setPassword] = useState("");
  useEffect(() => { if (open) setPassword(""); }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={`Reset password — ${employeeName}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password.trim()) return;
          onSave(password);
        }}
        className="space-y-4"
      >
        <Field label="New Password">
          <input required autoFocus minLength={8} autoCapitalize="none" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
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
