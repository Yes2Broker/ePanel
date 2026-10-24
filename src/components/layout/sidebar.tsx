"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { navFor } from "@/lib/nav";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { ComingSoonBadge } from "@/components/feature/coming-soon";
import { FullLogo, LogoIcon } from "@/components/ui/logo";

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, permissions } = useSession();
  const { prefs } = usePreferences();
  if (!user) return null;
  const nav = navFor(user, permissions);
  // Compact mode only applies on desktop; the mobile drawer always shows labels.
  const compact = prefs.compactSidebar;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/20 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-surface px-5 py-6 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0",
          compact && "lg:w-[76px] lg:px-4",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Phones: square icon. Desktop: full logo, or the icon when the sidebar is compact. */}
        <div className="mb-8 px-1">
          <div className="flex items-center gap-2.5 lg:hidden">
            <LogoIcon size={36} />
            <span className="text-[15px] font-semibold text-brand">Yes2Broker</span>
          </div>
          {compact
            ? <div className="hidden justify-center lg:flex"><LogoIcon size={40} /></div>
            : <div className="hidden lg:block"><FullLogo className="max-w-[210px]" priority /></div>}
        </div>

        <nav className="flex-1 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            // "/admin" must match exactly, otherwise it would also light up on /admin/employees.
            const isActive = !item.external && (item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`));
            const LinkTag = item.external ? "a" : Link;
            return (
              <LinkTag
                key={item.href}
                href={item.href}
                onClick={onClose}
                {...(item.external && { target: "_blank", rel: "noopener noreferrer" })}
                title={compact ? `${item.label}${item.comingSoon ? " (coming soon)" : item.external ? " (opens in a new tab)" : ""}` : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  compact && "lg:justify-center",
                  isActive ? "bg-white font-semibold text-ink shadow-card" : "font-normal text-ink-faint hover:text-ink-muted",
                  item.comingSoon && !isActive && "opacity-70"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className={cn("flex flex-1 items-center justify-between gap-2", compact && "lg:hidden")}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {item.label}
                    {item.external && <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-label="opens in a new tab" />}
                  </span>
                  {item.comingSoon && <ComingSoonBadge />}
                </span>
              </LinkTag>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
