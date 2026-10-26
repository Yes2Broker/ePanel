import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

export function PrimaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 py-2 md:min-h-10 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-brand-dark focus:ring-offset-1 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function SecondaryButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-surface-border bg-white px-4 py-2 md:min-h-10 text-sm font-medium text-ink transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-surface-border",
        className
      )}
      {...props}
    />
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-3 after:content-[''] focus:outline-none focus:ring-2 focus:ring-brand-dark disabled:opacity-40",
        checked ? "bg-ink" : "bg-status-neutralBg"
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}
