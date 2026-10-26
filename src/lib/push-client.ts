"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

/**
 * This device's push state. The browser's permission prompt only ever opens
 * from a tap on "Allow" (never on page load).
 *  - unsupported: no service worker / Push API (or the dev server)
 *  - ios-install: iPhone / iPad Safari, not added to the Home Screen yet
 *  - denied:      blocked in the browser settings
 *  - off / on:    whether this device is subscribed
 */
export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

const CHANGED = "push-changed";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // The worker is only registered on the live site; don't wait forever without it.
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}

async function currentSubscription() {
  return (await registration())?.pushManager.getSubscription() ?? null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !standalone()) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (!(await registration())) return "unsupported";
  return Notification.permission === "granted" && (await currentSubscription()) ? "on" : "off";
}

function keyBytes(base64: string) {
  const s = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  await api.pushSubscribe({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
}

/** Asks the browser (from a tap), subscribes this device and saves it. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") { window.dispatchEvent(new Event(CHANGED)); return permission === "denied" ? "denied" : "off"; }
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await save(sub);
  window.dispatchEvent(new Event(CHANGED));
  return "on";
}

/** Stops pushes to this device (removes it on the server and in the browser). */
export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** On each visit: keep this device linked to whoever is signed in on it. */
export async function syncPush() {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await save(sub).catch(() => {});
}

/** On log out: stop sending this person's notifications to this device. */
export async function forgetDevice() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (sub) await api.pushUnsubscribe(sub.endpoint).catch(() => {});
}

export function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [refresh]);
  return { state, refresh };
}
