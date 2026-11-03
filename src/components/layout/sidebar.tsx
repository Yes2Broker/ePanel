"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, ExternalLink, Search } from "lucide-react";
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
 * the full sidebar, grouped in sections, unless it's collapsed (remembered on
 * this device). Ctrl+K finds any page. Phones use the bottom bar.
 */
/** Small red dot: "your attendance was updated, please check it". */
export function UpdateDot({ className }: { className?: string }) {
  return <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-status-danger", className)} aria-hidden />;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, permissions } = useSession();
  const { prefs, update } = usePreferences();
  const attUpdated = (useAttUpdates().data?.length ?? 0) > 0;
  const [finder, setFinder] = useState(false);
  // Ctrl+K / ⌘K: jump to any page this person can open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setFinder((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
          "flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
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
        "sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col overflow-y-auto bg-surface px-3.5 py-6 md:flex",
        !compact && "lg:w-[280px] lg:px-5"
      )}
    >
      <div className="mb-6 flex items-center gap-2 px-1">
        <div className={cn("flex-1 justify-center", compact ? "flex" : "flex lg:hidden")}><LogoIcon size={40} /></div>
        {!compact && <div className="hidden min-w-0 flex-1 lg:block"><FullLogo className="max-w-[180px]" priority /></div>}
      </div>
      {/* Collapse / expand (desktop only; remembered on this device). */}
      <button onClick={() => update({ compactSidebar: !compact })} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"}
        className={cn("mb-3 hidden h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-ink-faint hover:bg-white hover:text-ink lg:flex", compact && "justify-center")}>
        {compact ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
      </button>
      <button onClick={() => setFinder(true)} title="Find a page (Ctrl+K)" aria-label="Find a page"
        className={cn("mb-4 flex h-9 items-center gap-2 rounded-lg border border-surface-border bg-white px-2.5 text-xs text-ink-faint hover:text-ink", compact ? "justify-center" : "justify-center lg:justify-start")}>
        <Search className="h-4 w-4 shrink-0" />
        <span className={cn("flex-1 items-center justify-between", labels)}>Search <kbd className="rounded border border-surface-border px-1 font-sans text-[10px]">Ctrl K</kbd></span>
      </button>

      <nav className="flex-1 space-y-4" aria-label="Main">
        {sections.map((sec) => (
          <div key={sec.label} className="space-y-1">
            <p className={cn("px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint/80", compact ? "hidden" : "hidden lg:block")}>{sec.label}</p>
            {compact ? null : <div className="mx-2 border-t border-surface-border lg:hidden" aria-hidden />}
            {sec.items.map(link)}
          </div>
        ))}
      </nav>
      <div className="mt-4 space-y-1 border-t border-surface-border pt-4">{bottom.map(link)}</div>
      {finder && <PageFinder items={[...sections.flatMap((x) => x.items), ...bottom]} onClose={() => setFinder(false)} />}
    </aside>
  );
}

/** Ctrl+K: type to filter the pages this person can open; Enter opens the first. */
function PageFinder({ items, onClose }: { items: NavItem[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const shown = items.filter((i) => !i.comingSoon && i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const go = (i: NavItem | undefined) => {
    if (!i) return;
    onClose();
    if (i.external) window.open(i.href, "_blank", "noopener,noreferrer"); else router.push(i.href);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/20 px-4 pt-[15vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Find a page">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-surface-border px-4">
          <Search className="h-4 w-4 text-ink-faint" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Go to page…" aria-label="Go to page"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") go(shown[active]);
            }}
            className="h-12 flex-1 bg-transparent text-sm text-ink focus:outline-none" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {shown.map((i, n) => {
            const Icon = i.icon;
            return (
              <li key={i.href}>
                <button onMouseEnter={() => setActive(n)} onClick={() => go(i)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm", n === active ? "bg-surface text-ink" : "text-ink-muted")}>
                  <Icon className="h-4 w-4" /> {i.label} {i.external && <ExternalLink className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-3 text-sm text-ink-faint">No page matches.</li>}
        </ul>
      </div>
    </div>
  );
}
