"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { Popover } from "@/components/ui/pickers";
import { api } from "@/lib/api";
import { syncPush } from "@/lib/push-client";
import { cn } from "@/lib/utils";
import { AppNotification, NotificationList } from "@/types";

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "24 Oct". */
function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  if (mins < 48 * 60) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * 🔔 in the header: unread count, and the latest 30 in a dropdown (a bottom
 * sheet on phones). Tapping one marks it read and opens its page.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => { api.notifications().then(setData).catch(() => {}); }, []);
  useEffect(() => {
    load();
    syncPush();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onMessage = (e: MessageEvent) => { if (e.data === "notifications-changed") load(); };
    const timer = setInterval(onVisible, 60_000);
    window.addEventListener("notifications-changed", load);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("notifications-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const close = useCallback(() => setOpen(false), []);
  const unread = data?.unread ?? 0;

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setData((d) => d && { unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
      api.markNotificationRead(n.id).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };
  const markAll = async () => {
    setData((d) => d && { unread: 0, items: d.items.map((x) => ({ ...x, read: true })) });
    await api.markNotificationRead(null).catch(() => {});
  };

  return (
    <>
      <button ref={button} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink-muted shadow-card hover:text-ink md:h-10 md:w-10">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-semibold leading-none text-white" data-testid="bell-count">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <Popover open={open} onClose={close} anchor={button} title="Notifications" width={360}>
        <div className="sm:w-[22rem]">
          <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-0.5">
            <p className="hidden text-sm font-semibold text-ink sm:block">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="ml-auto min-h-9 rounded-lg px-2 text-xs font-medium text-brand hover:bg-brand-soft">Mark all read</button>
            )}
          </div>
          {!data ? (
            <p className="px-3 py-8 text-center text-sm text-ink-faint">Loading…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <BellOff className="h-5 w-5 text-ink-faint" />
              <p className="text-sm text-ink-faint">No notifications yet.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto sm:max-h-[26rem]" aria-label="Latest notifications">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={cn("flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface", !n.read && "bg-brand-soft/50")}>
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block break-words text-sm", n.read ? "text-ink-muted" : "font-semibold text-ink")}>{n.title}</span>
                      {n.body && <span className="block break-words text-xs text-ink-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-ink-faint">{ago(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}
