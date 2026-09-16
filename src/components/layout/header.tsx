"use client";

import { useState } from "react";
import { Search, Bell, Mail, Menu, LogOut } from "lucide-react";
import { Employee } from "@/types";
import { initials } from "@/lib/utils";
import { useSession } from "@/context/session-context";
import { useRouter } from "next/navigation";

export function Header({ user, onMenuClick }: { user: Employee; onMenuClick: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout } = useSession();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-4 lg:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="rounded-full bg-white p-2 shadow-card lg:hidden">
          <Menu className="h-4 w-4 text-ink" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            placeholder="Search employee, task, report…"
            className="w-72 rounded-pill border-none bg-white py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink-faint shadow-card focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button className="rounded-full bg-white p-2.5 text-ink shadow-card">
          <Mail className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button className="relative rounded-full bg-white p-2.5 text-ink shadow-card">
          <Bell className="h-4 w-4" strokeWidth={1.75} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-status-danger" />
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-medium text-white shadow-card">
            {initials(user.name)}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-52 rounded-card border border-surface-border bg-white p-1 shadow-card">
              <div className="border-b border-surface-border px-3 py-2.5">
                <p className="text-sm font-medium text-ink">{user.name}</p>
                <p className="text-xs text-ink-faint">{user.role} · {user.department}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); logout(); router.push("/login"); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-surface"
              >
                <LogOut className="h-3.5 w-3.5" /> Switch account / Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
