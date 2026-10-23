import { LucideIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">{title}</h1>
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

export function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-12 text-sm text-ink-faint", className)}>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
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
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium", value === t.value ? "bg-ink text-white" : "bg-white text-ink-muted shadow-card hover:text-ink")}
        >
          {t.label}
          {!!t.count && (
            <span className={cn("rounded-full px-1.5 text-xs", value === t.value ? "bg-brand text-ink" : "bg-status-warningBg text-status-warning")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export const tableHeadCls = "border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-faint";
export const selectCls = "rounded-pill border border-surface-border bg-white px-3 py-2 text-sm text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand";
