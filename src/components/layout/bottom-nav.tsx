"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ExternalLink, LayoutGrid, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem, bottomNavFor, isActivePath } from "@/lib/nav";
import { useSession } from "@/context/session-context";
import { ComingSoonBadge } from "@/components/feature/coming-soon";
import { UpdateDot } from "@/components/layout/sidebar";
import { useAttUpdates } from "@/lib/att-updates";
import { Modal } from "@/components/ui/modal";
import { NavLink } from "@/components/layout/sidebar";

/**
 * True while the on-screen keyboard is (probably) open: a text field has
 * focus on a touch screen, or the visible area shrank a lot.
 */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const typing = (el: Element | null) =>
      !!el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
        (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes((el as HTMLInputElement).type)));
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let pressing = false;
    let timer = 0;
    const check = () => {
      const vv = window.visualViewport;
      const shrunk = !!vv && window.innerHeight - vv.height > 150;
      const next = shrunk || (touch && typing(document.activeElement));
      // Bringing the bar back moves the Submit button up. Wait until the finger
      // lifts, so a tap on Submit (which closes the keyboard) still lands on it.
      if (!next && pressing) return;
      setOpen(next);
    };
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(check, 300); };
    const down = () => { pressing = true; };
    const up = () => { pressing = false; later(); };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    window.visualViewport?.addEventListener("resize", later);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      window.visualViewport?.removeEventListener("resize", later);
    };
  }, []);
  return open;
}

function BarButton({ item, active, onClick, dot }: { item: NavItem; active: boolean; onClick?: () => void; dot?: boolean }) {
  const Icon = item.icon;
  const body = (
    <>
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
        {item.external && <ExternalLink className="absolute -right-2.5 -top-1 h-3 w-3" aria-hidden />}
        {dot && <UpdateDot />}
      </span>
      <span className="max-w-full break-words text-center text-[0.6875rem] leading-[1.1]">{item.short ?? item.label}</span>
    </>
  );
  const cls = cn(
    "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 font-medium transition-colors",
    active ? "text-brand" : "text-ink-faint active:text-ink-muted",
    item.comingSoon && "opacity-60"
  );
  return (
    <NavLink item={item} className={cls} onClick={onClick} title={item.external ? `${item.label} (opens in a new tab)` : undefined}>
      {body}
      {item.external && <span className="sr-only">(opens in a new tab)</span>}
      {active && <span className="sr-only">(current page)</span>}
      {dot && <span className="sr-only">(updated – please check)</span>}
    </NavLink>
  );
}

/** Phone navigation (below 768px), fixed to the bottom like a native app. */
export function BottomNav() {
  const pathname = usePathname();
  const { user, permissions } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const keyboard = useKeyboardOpen();

  // Tell the CSS (--nav-h) whether the bar is showing, so the page, toasts and
  // the report form's Submit bar sit above it.
  useEffect(() => {
    document.documentElement.dataset.nav = keyboard ? "off" : "on";
    return () => { delete document.documentElement.dataset.nav; };
  }, [keyboard]);

  useEffect(() => setMoreOpen(false), [pathname]);
  const attUpdated = (useAttUpdates().data?.length ?? 0) > 0;

  if (!user) return null;
  const { bar, more } = bottomNavFor(user, permissions);
  const moreActive = more.some((i) => isActivePath(i, pathname));

  return (
    <>
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
          keyboard && "hidden"
        )}
      >
        <div className="mx-auto flex h-16 max-w-lg items-stretch">
          {bar.map((item) => <BarButton key={item.href} item={item} active={isActivePath(item, pathname)} dot={item.href === "/attendance" && attUpdated} />)}
          {more.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn("flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 font-medium", moreActive || moreOpen ? "text-brand" : "text-ink-faint")}
            >
              <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={moreActive ? 2.25 : 1.75} />
              <span className="text-[0.6875rem] leading-[1.1]">More</span>
            </button>
          )}
        </div>
      </nav>

      {more.length > 0 && (
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="sm" bodyClassName="p-2">
          <ul className="space-y-0.5">
            {more.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(item, pathname);
              return (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    onClick={() => setMoreOpen(false)}
                    className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px]", active ? "bg-brand-soft font-semibold text-brand" : "text-ink hover:bg-surface", item.comingSoon && "text-ink-muted")}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                    <span className="flex flex-1 items-center gap-1.5">
                      {item.label}
                      {item.external && <ExternalLink className="h-3.5 w-3.5" aria-label="opens in a new tab" />}
                    </span>
                    {item.comingSoon ? <ComingSoonBadge /> : !item.external && <ChevronRight className="h-4 w-4 text-ink-faint" />}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
