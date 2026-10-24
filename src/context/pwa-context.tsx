"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { RefreshCw, Share, SquarePlus, Plus, EllipsisVertical, Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PrimaryButton } from "@/components/ui/button";
import { LogoIcon } from "@/components/ui/logo";

// Chrome / Edge / Samsung Internet fire this when the panel can be installed.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaValue {
  /** Show an "Install app" button: not installed yet, and either the browser can prompt or we can show a guide. */
  canInstall: boolean;
  /** Prompt (Android/desktop Chrome/Edge) or open the step-by-step guide (iPhone, other phones). */
  install: () => void;
  /** Running as the installed app. */
  installed: boolean;
  /** A phone or tablet (the dashboard banner is only shown there). */
  isTouch: boolean;
}

const PwaContext = createContext<PwaValue>({ canInstall: false, install: () => {}, installed: false, isTouch: false });

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [ios, setIos] = useState(false);
  const [guide, setGuide] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const refreshing = useRef(false);
  const reloading = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    update();
    standalone.addEventListener?.("change", update);
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    setIos(isIOS());

    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setPrompt(null); setInstalled(true); setGuide(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener?.("change", update);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Service worker: makes the panel installable, opens it fast, shows the
  // offline page. A new version waits until the person taps "Refresh".
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reg: ServiceWorkerRegistration | undefined;
    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const sw = r.installing;
        sw?.addEventListener("statechange", () => {
          // Only an update (there's already a controller), not the first install.
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    };
    navigator.serviceWorker.register("/sw.js").then((r) => { reg = r; watch(r); }).catch(() => {});
    // Reload only when the person tapped "Refresh". The first install also
    // takes control of the page, and that must not reload it out from under them.
    const onController = () => {
      if (!refreshing.current || reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    // Look for a new version whenever the app comes back to the screen.
    const onVisible = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const install = useCallback(async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setPrompt(null); // a prompt can only be used once
      return;
    }
    setGuide(true);
  }, [prompt]);

  const canInstall = !installed && (!!prompt || isTouch);

  return (
    <PwaContext.Provider value={{ canInstall, install, installed, isTouch }}>
      {children}
      <InstallGuide open={guide} ios={ios} onClose={() => setGuide(false)} />
      {waiting && (
        <div className="fixed inset-x-4 bottom-[calc(var(--nav-h)+1rem)] z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-surface-border bg-white px-4 py-3 text-sm text-ink shadow-lg sm:left-auto sm:right-4 sm:mx-0" role="status">
          <RefreshCw className="h-4 w-4 shrink-0 text-brand" />
          <span className="flex-1">New version available</span>
          <button
            onClick={() => { refreshing.current = true; waiting.postMessage("SKIP_WAITING"); }}
            className="min-h-10 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Refresh
          </button>
        </div>
      )}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  return useContext(PwaContext);
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{n}</span>
      <span className="flex flex-1 flex-wrap items-center gap-1.5 text-sm text-ink">{children}</span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border text-ink-muted">{icon}</span>
    </li>
  );
}

/** For browsers without an install prompt: iPhone/iPad Safari, and Android browsers that didn't offer one. */
function InstallGuide({ open, ios, onClose }: { open: boolean; ios: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Install Yes2Broker Panel" size="sm"
      footer={<PrimaryButton className="w-full justify-center" onClick={onClose}>Got it</PrimaryButton>}>
      <div className="mb-5 flex items-center gap-3">
        <LogoIcon size={48} />
        <p className="text-sm text-ink-muted">Add the panel to your home screen. It opens full screen, like an app.</p>
      </div>
      {ios ? (
        <ol className="space-y-4">
          <Step n={1} icon={<Share className="h-5 w-5" />}>Tap <b>Share</b> in Safari&apos;s toolbar</Step>
          <Step n={2} icon={<SquarePlus className="h-5 w-5" />}>Scroll down and tap <b>Add to Home Screen</b></Step>
          <Step n={3} icon={<Plus className="h-5 w-5" />}>Tap <b>Add</b> (top right)</Step>
        </ol>
      ) : (
        <ol className="space-y-4">
          <Step n={1} icon={<EllipsisVertical className="h-5 w-5" />}>Open the browser menu <b>⋮</b></Step>
          <Step n={2} icon={<Download className="h-5 w-5" />}>Tap <b>Install app</b> or <b>Add to Home screen</b></Step>
          <Step n={3} icon={<Plus className="h-5 w-5" />}>Tap <b>Install</b> / <b>Add</b></Step>
        </ol>
      )}
      {ios && <p className="mt-5 text-xs text-ink-faint">On iPhone this only works in Safari. In Chrome or another app, open this page in Safari first.</p>}
    </Modal>
  );
}
