"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, LogOut, User } from "lucide-react";
import { Employee } from "@/types";
import { initials, formatDate, todayISO } from "@/lib/utils";
import { useSession } from "@/context/session-context";
import { useRouter } from "next/navigation";

export function Header({ user, onMenuClick }: { user: Employee; onMenuClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 lg:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="rounded-full bg-white p-2 shadow-card lg:hidden" aria-label="Open menu">
          <Menu className="h-4 w-4 text-ink" />
        </button>
        <span className="hidden rounded-full bg-white px-3.5 py-2 text-xs font-medium text-ink-muted shadow-card sm:inline">
          {formatDate(todayISO(), { weekday: true })}
        </span>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-full bg-white py-1 pl-1 pr-3.5 shadow-card"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">{initials(user.name)}</span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-ink">{user.name}</span>
            <span className="block text-xs leading-tight text-ink-faint">{user.role} · {user.department}</span>
          </span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-12 z-30 w-52 rounded-card border border-surface-border bg-white p-1 shadow-card" role="menu">
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface"
            >
              <User className="h-3.5 w-3.5" /> My profile
            </Link>
            <button
              onClick={async () => { setMenuOpen(false); await logout(); router.replace("/login"); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface"
            >
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
