"use client";

import { usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/lib/nav";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  // On phones the top bar already shows this title; don't repeat it (screen readers still get it).
  const inTopBar = pageTitle(usePathname()) === title;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className={cn("text-2xl font-semibold text-ink sm:text-[28px]", inTopBar && "max-md:sr-only")}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-status-dangerBg px-4 py-3 text-sm text-status-danger">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="font-medium underline underline-offset-2">Try again</button>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink/[0.06]", className)} aria-hidden />;
}

/** Placeholder rows while data loads, roughly the size of a list, so the page doesn't jump. */
export function Loading({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <div className={cn("space-y-3 py-3", className)} role="status">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-1/2" : "w-2/3")} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-surface-border bg-white px-4 py-14 text-center">
      <div className="mb-3 rounded-full bg-surface p-3">
        <Icon className="h-5 w-5 text-ink-faint" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-ink-faint">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium", value === t.value ? "bg-ink text-white" : "bg-white text-ink-muted shadow-card hover:text-ink")}
        >
          {t.label}
          {!!t.count && (
            <span className={cn("rounded-full px-1.5 text-xs", value === t.value ? "bg-white text-ink" : "bg-status-warningBg text-status-warning")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export const tableHeadCls = "border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-faint";
export const selectCls = "min-h-10 max-w-full rounded-pill border border-surface-border bg-white px-3 py-2 text-base sm:text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand";
