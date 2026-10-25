"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, LucideIcon } from "lucide-react";

/** "⋯" button with a short list of page actions (used on phones to save space). */
export function OverflowMenu({ items, label = "More actions" }: { items: { href: string; label: string; icon: LucideIcon }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted shadow-card hover:text-ink">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-52 rounded-card border border-surface-border bg-white p-1 shadow-lg">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-ink hover:bg-surface">
              <Icon className="h-4 w-4 text-ink-muted" /> {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
