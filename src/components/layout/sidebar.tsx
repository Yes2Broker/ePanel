"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem, isActivePath, navSectionsFor } from "@/lib/nav";
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
 * the full sidebar, grouped in sections, unless "Compact sidebar" is on in
 * Settings. Phones use the bottom bar.
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
  const { sections, bottom } = navSectionsFor(user, permissions);
  const compact = prefs.compactSidebar;
  // Labels are hidden on tablets always, and on desktop when collapsed.
  const labels = compact ? "hidden" : "hidden lg:flex";
  const link = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isActivePath(item, pathname);
    return (
      <NavLink
        key={item.href}
        item={item}
        title={`${item.label}${item.comingSoon ? " (coming soon)" : item.external ? " (opens in a new tab)" : ""}`}
        className={cn(
          // Tight rows so the whole menu fits the screen height (smaller still on short screens).
          "flex min-h-9 items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm transition-colors [@media(max-height:720px)]:min-h-8 [@media(max-height:720px)]:py-1",
          compact ? "justify-center" : "justify-center lg:justify-start",
          isActive ? "bg-white font-semibold text-ink shadow-card" : "font-normal text-ink-faint hover:text-ink-muted",
          item.comingSoon && !isActive && "opacity-70"
        )}
      >
        <span className="relative shrink-0">
          <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
          {item.href === "/attendance" && attUpdated && <UpdateDot />}
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
  };

  return (
    <aside
      className={cn(
        // Full height, never scrolls: everything is sized to fit.
        "sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col overflow-hidden bg-surface px-3.5 py-4 md:flex [@media(max-height:720px)]:py-3",
        !compact && "lg:w-[280px] lg:px-5"
      )}
    >
      <div className="mb-4 flex shrink-0 items-center gap-2 px-1 [@media(max-height:720px)]:mb-2">
        <div className={cn("flex-1 justify-center", compact ? "flex" : "flex lg:hidden")}><LogoIcon size={34} /></div>
        {!compact && <div className="hidden min-w-0 flex-1 lg:block"><FullLogo className="max-w-[160px] [@media(max-height:720px)]:max-w-[130px]" priority /></div>}
      </div>
      <nav className="min-h-0 flex-1 space-y-2.5 [@media(max-height:720px)]:space-y-1.5" aria-label="Main">
        {sections.map((sec) => (
          <div key={sec.label} className="space-y-0.5">
            <p className={cn("px-2.5 text-[9.5px] font-semibold uppercase leading-4 tracking-wider text-ink-faint/80 [@media(max-height:720px)]:!hidden", compact ? "hidden" : "hidden lg:block")}>{sec.label}</p>
            {compact ? null : <div className="mx-2 border-t border-surface-border lg:hidden" aria-hidden />}
            {sec.items.map(link)}
          </div>
        ))}
      </nav>
      <div className="mt-2 shrink-0 space-y-0.5 border-t border-surface-border pt-2">{bottom.map(link)}</div>
    </aside>
  );
}
