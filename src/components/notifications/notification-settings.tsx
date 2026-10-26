"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SecondaryButton, Toggle } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { disablePush, enablePush, usePushState } from "@/lib/push-client";
import { notificationTypesFor } from "@/lib/notification-types";

const DEVICE_NOTE: Record<string, string> = {
  unsupported: "This browser can't show notifications.",
  "ios-install": "Add ePanel to your Home Screen first to get notifications.",
  denied: "Notifications are blocked for this site. Allow them in your browser settings, then come back.",
  off: "Push notifications are off on this device.",
  on: "This device gets push notifications.",
};

/** Settings → Notifications: this device on/off, each type on/off, a test. */
export function NotificationSettings() {
  const { user, permissions } = useSession();
  const toast = useToast();
  const { state } = usePushState();
  const prefs = useApi(() => api.notificationPrefs());
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  if (!user) return null;
  const types = notificationTypesFor(user, permissions);
  const off = prefs.data?.off ?? [];

  const setDevice = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const next = await enablePush();
        if (next === "denied") toast("Notifications are blocked. Allow them in your browser settings.", "error");
        else if (next === "on") toast("Notifications are on for this device.");
      } else {
        await disablePush();
        toast("Notifications are off for this device.");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const setType = async (type: string, on: boolean) => {
    prefs.setData({ off: on ? off.filter((t) => t !== type) : [...off, type] });
    try {
      prefs.setData(await api.setNotificationPref(type, on));
    } catch (err) {
      toast(errorMessage(err), "error");
      prefs.reload();
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      await api.notifyTest();
      toast(state === "on" ? "Test notification sent." : "Test notification added to the bell.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 text-sm font-semibold text-ink">Notifications</h3>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-ink">Push notifications on this device</p>
          <p className="text-xs text-ink-faint">{state ? DEVICE_NOTE[state] : "Checking…"}</p>
        </div>
        <Toggle checked={state === "on"} disabled={busy || (state !== "on" && state !== "off")} onChange={setDevice} label="Push notifications on this device" />
      </div>
      <p className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">Notify me about</p>
      <div className="divide-y divide-surface-border">
        {types.map((t) => (
          <div key={t.type} className="flex min-h-11 items-center justify-between gap-4 py-1">
            <p className="text-sm text-ink">{t.label}</p>
            <Toggle checked={!off.includes(t.type)} disabled={!prefs.data} onChange={(v) => setType(t.type, v)} label={t.label} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">Turned-off types don&apos;t appear in the bell or as a push, on any device.</p>
      <SecondaryButton onClick={test} disabled={testing} className="mt-3"><Send className="h-3.5 w-3.5" /> {testing ? "Sending…" : "Send test notification"}</SecondaryButton>
    </Card>
  );
}
