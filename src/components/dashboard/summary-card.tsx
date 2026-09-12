import { LucideIcon, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function SummaryCard({
  icon: Icon, label, value, delta, note,
}: { icon: LucideIcon; label: string; value: string | number; delta?: string; note?: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand">
          <Icon className="h-3.5 w-3.5 text-ink" strokeWidth={2.25} />
        </div>
        <span className="text-sm text-ink-muted">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none text-ink">{value}</span>
        {delta && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-status-success">
            <ArrowUpRight className="h-3 w-3" /> {delta}
          </span>
        )}
      </div>
      {note && <p className="mt-1.5 text-xs text-ink-faint">{note}</p>}
    </Card>
  );
}
