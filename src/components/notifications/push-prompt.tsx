"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { enablePush, usePushState } from "@/lib/push-client";
import { errorMessage } from "@/lib/api";

/**
 * "Get notifications on this device" — shown after login until the person
 * allows it or closes the card. The browser's own prompt only opens from Allow.
 */
export function PushPrompt() {
  const { user } = useSession();
  const toast = useToast();
  const { state } = usePushState();
  const key = `y2b-push-prompt-${user?.id}`;
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(key) === "1"); } catch { setHidden(false); }
  }, [key]);
  if (!user || hidden || (state !== "off" && state !== "ios-install")) return null;

  const dismiss = () => {
    setHidden(true);
    try { window.localStorage.setItem(key, "1"); } catch { /* shows again next visit */ }
  };
  const allow = async () => {
    setBusy(true);
    try {
      const next = await enablePush();
      if (next === "on") { toast("Notifications are on for this device."); dismiss(); }
      else if (next === "denied") { toast("Notifications are blocked. Allow them in your browser settings.", "error"); dismiss(); }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="region" aria-label="Notifications on this device" className="mb-3 mt-1 flex items-center gap-3 rounded-card border border-surface-border bg-white px-4 py-3 shadow-card md:mt-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft"><Bell className="h-4 w-4 text-brand" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Get notifications on this device</p>
        <p className="text-xs text-ink-faint">
          {state === "ios-install"
            ? "Add ePanel to your Home Screen first to get notifications."
            : "Leave, attendance and report updates, even when the panel is closed."}
        </p>
      </div>
      {state === "off" && <PrimaryButton onClick={allow} disabled={busy} className="min-h-10 shrink-0">{busy ? "…" : "Allow"}</PrimaryButton>}
      <button onClick={dismiss} aria-label="Not now" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
