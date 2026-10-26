"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem, isActivePath, navFor } from "@/lib/nav";
import { useSession } from "@/context/session-context";
import { usePreferences } from "@/context/preferences-context";
import { ComingSoonBadge } from "@/components/feature/coming-soon";
import { FullLogo, LogoIcon } from "@/components/ui/logo";
import { useAttUpdates } from "@/lib/att-updates";

/** A nav link: internal pages use the router, other Yes2Broker sites open in a new tab. */
export function NavLink({ item, className, children, onClick, title }: {
  item: NavItem; className?: string; children: React.ReactNode; onClick?: () => void; title?: string;
}) {
  if (item.external) {
    return <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onClick} title={title} className={className}>{children}</a>;
  }
  return <Link href={item.href} onClick={onClick} title={title} className={className}>{children}</Link>;
}

/**
 * Tablet and desktop (768px+). Tablets get the icon-only rail; desktops get
 * the full sidebar unless "Compact sidebar" is on. Phones use the bottom bar.
 */
/** Small red dot: "your attendance was updated, please check it". */
export function UpdateDot({ className }: { className?: string }) {
  return <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-status-danger", className)} aria-hidden />;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, permissions } = useSession();
  const { prefs } = usePreferences();
  const attUpdated = (useAttUpdates().data?.length ?? 0) > 0;
  if (!user) return null;
  const nav = navFor(user, permissions);
  const compact = prefs.compactSidebar;
  // Labels are hidden on tablets always, and on desktop in compact mode.
  const labels = compact ? "hidden" : "hidden lg:flex";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col overflow-y-auto bg-surface px-3.5 py-6 md:flex",
        !compact && "lg:w-[280px] lg:px-5"
      )}
    >
      <div className="mb-8 px-1">
        <div className={cn("justify-center", compact ? "flex" : "flex lg:hidden")}><LogoIcon size={40} /></div>
        {!compact && <div className="hidden lg:block"><FullLogo className="max-w-[210px]" priority /></div>}
      </div>

      <nav className="flex-1 space-y-1" aria-label="Main">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive = isActivePath(item, pathname);
          return (
            <NavLink
              key={item.href}
              item={item}
              title={`${item.label}${item.comingSoon ? " (coming soon)" : item.external ? " (opens in a new tab)" : ""}`}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                compact ? "justify-center" : "justify-center lg:justify-start",
                isActive ? "bg-white font-semibold text-ink shadow-card" : "font-normal text-ink-faint hover:text-ink-muted",
                item.comingSoon && !isActive && "opacity-70"
              )}
            >
              <span className="relative shrink-0">
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
                {item.href === "/attendance" && attUpdated && <UpdateDot className={compact ? undefined : "lg:hidden"} />}
              </span>
              <span className={cn("flex-1 items-center justify-between gap-2", labels)}>
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {item.label}
                  {item.external && <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-label="opens in a new tab" />}
                </span>
                {item.comingSoon && <ComingSoonBadge />}
                {item.href === "/attendance" && attUpdated && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-status-dangerBg px-2 py-0.5 text-[11px] font-medium text-status-danger">Check</span>
                )}
              </span>
              <span className={cn("sr-only", !compact && "lg:hidden")}>{item.label}</span>
              {item.href === "/attendance" && attUpdated && <span className="sr-only">(updated – please check)</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
