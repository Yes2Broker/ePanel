"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo";
import { usePwa } from "@/context/pwa-context";

const KEY = "y2b-install-banner-dismissed";
const HIDE_FOR = 14 * 24 * 60 * 60 * 1000; // 14 days

/** "Install on your phone" banner for the dashboards. Phones and tablets only, until installed. */
export function InstallBanner() {
  const { canInstall, isTouch, install } = usePwa();
  const [dismissed, setDismissed] = useState(true); // hidden until we've checked storage

  useEffect(() => {
    try {
      const at = Number(window.localStorage.getItem(KEY) || 0);
      setDismissed(Date.now() - at < HIDE_FOR);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!canInstall || !isTouch || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked: hide for this visit only */ }
  };

  return (
    <div className="flex items-start gap-3 rounded-card border border-brand/15 bg-brand-soft p-3 pr-1.5 sm:items-center">
      <LogoIcon size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-sm font-medium text-ink sm:flex-1">Install Yes2Broker Panel on your phone</p>
        <button onClick={install} className="min-h-10 self-start rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark sm:self-auto">Install</button>
      </div>
      <button onClick={dismiss} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-white/60" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
