"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/types";
import { navForRole } from "@/lib/nav";

export function Sidebar({ role, mobileOpen, onClose }: { role: Role; mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const nav = navForRole(role);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/20 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-surface px-5 py-6 transition-transform lg:static lg:z-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-8 flex items-center gap-2 px-1">
          <div className="h-7 w-7 overflow-hidden rounded-lg">
            <Image src="/assets/logo.webp" alt="Yes2Broker" width={28} height={28} className="h-full w-full object-cover" />
          </div>
          <span className="text-[15px] font-semibold text-ink">Yes2Broker</span>
        </div>

        <nav className="flex-1 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive ? "font-semibold text-ink" : "font-normal text-ink-faint hover:text-ink-muted"
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 pt-4">
          <button className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-faint hover:text-ink-muted">
            <Headphones className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Support
          </button>
          <Link href="/settings" className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-faint hover:text-ink-muted">
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Settings
          </Link>
        </div>
      </aside>
    </>
  );
}
