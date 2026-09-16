import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-card border border-surface-border bg-white shadow-card", className)}>
      {children}
    </div>
  );
}
