import Link from "next/link";
import { LucideIcon, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function SummaryCard({
  icon: Icon, label, value, note, href,
}: { icon: LucideIcon; label: string; value: string | number; note?: string; href?: string }) {
  // Phones: one compact row (icon, label + note, value). Larger screens: the tile.
  const body = (
    <Card className="flex h-full min-h-[4.5rem] items-center gap-3 p-4 transition-colors sm:block">
      <div className="flex items-center gap-2.5 sm:mb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft sm:h-7 sm:w-7">
          <Icon className="h-4 w-4 text-brand sm:h-3.5 sm:w-3.5" strokeWidth={2.25} />
        </div>
        <span className="hidden text-sm text-ink-muted sm:inline">{label}</span>
        {href && <ArrowUpRight className="ml-auto hidden h-3.5 w-3.5 text-ink-faint sm:block" />}
      </div>
      <div className="min-w-0 flex-1 sm:hidden">
        <p className="text-sm text-ink-muted">{label}</p>
        {note && <p className="text-xs text-ink-faint">{note}</p>}
      </div>
      <span className="max-w-[55%] truncate text-xl font-semibold leading-none text-ink sm:block sm:max-w-none sm:text-[26px]">{value}</span>
      {note && <p className="mt-1.5 hidden truncate text-xs text-ink-faint sm:block">{note}</p>}
      {href && <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint sm:hidden" />}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-card hover:opacity-90">{body}</Link> : body;
}
