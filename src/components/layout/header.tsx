"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, User, Settings, Download } from "lucide-react";
import { Employee } from "@/types";
import { initials, formatDate, todayISO } from "@/lib/utils";
import { pageTitle } from "@/lib/nav";
import { LogoIcon } from "@/components/ui/logo";
import { useSession } from "@/context/session-context";
import { usePwa } from "@/context/pwa-context";
import { NotificationBell } from "@/components/notifications/notification-bell";

const menuItemCls = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface hover:text-ink md:min-h-9";

/**
 * Phones: a slim sticky bar with the square icon, the page title and the
 * avatar menu. Tablet / desktop: today's date and the avatar menu.
 */
export function Header({ user }: { user: Employee }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { logout } = useSession();
  const { canInstall, install } = usePwa();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-surface/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:static md:bg-transparent md:py-4 md:backdrop-blur-none lg:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoIcon size={32} className="shrink-0 md:hidden" />
        <span className="truncate text-base font-semibold text-ink md:hidden">{pageTitle(pathname)}</span>
        <span className="hidden rounded-full bg-white px-3.5 py-2 text-xs font-medium text-ink-muted shadow-card md:inline">
          {formatDate(todayISO(), { weekday: true })}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
      <NotificationBell />
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex min-h-11 items-center gap-2.5 rounded-full bg-white p-1 shadow-card md:min-h-0 md:pr-3.5"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-medium text-white md:h-8 md:w-8">{initials(user.name)}</span>
          <span className="hidden text-left md:block">
            <span className="block text-sm font-medium leading-tight text-ink">{user.name}</span>
            <span className="block text-xs leading-tight text-ink-faint">{user.role} · {user.department}</span>
          </span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 rounded-card border border-surface-border bg-white p-1 shadow-lg" role="menu">
            <div className="border-b border-surface-border px-3 pb-2 pt-1.5 md:hidden">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-faint">{user.role} · {user.department}</p>
            </div>
            <Link href="/profile" role="menuitem" className={menuItemCls}><User className="h-4 w-4" /> My profile</Link>
            <Link href="/settings" role="menuitem" className={menuItemCls}><Settings className="h-4 w-4" /> Settings</Link>
            {canInstall && (
              <button role="menuitem" onClick={() => { setMenuOpen(false); install(); }} className={menuItemCls}>
                <Download className="h-4 w-4" /> Install app
              </button>
            )}
            <button
              role="menuitem"
              onClick={async () => { setMenuOpen(false); await logout(); router.replace("/login"); }}
              className={menuItemCls}
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
