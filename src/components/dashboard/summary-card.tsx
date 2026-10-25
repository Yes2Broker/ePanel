import Link from "next/link";
import { LucideIcon, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Stat tile: label on top, value below. Two per row on phones, where the
 * icon is dropped to leave room for large phone font sizes. Long values wrap
 * to a second line instead of being cut off.
 */
export function SummaryCard({
  icon: Icon, label, value, note, href,
}: { icon: LucideIcon; label: string; value: string | number; note?: string; href?: string }) {
  // Numbers and short codes are big; names and words a bit smaller so they fit.
  const short = String(value).length <= 7;
  const body = (
    <Card className="relative flex h-full min-w-0 flex-col p-3 transition-colors sm:p-4">
      <div className="mb-1.5 flex min-w-0 items-center gap-2.5 pr-4 sm:mb-3 sm:pr-0">
        <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft sm:flex">
          <Icon className="h-3.5 w-3.5 text-brand" strokeWidth={2.25} />
        </div>
        <span className="min-w-0 flex-1 text-xs leading-snug text-ink-muted sm:text-sm">{label}</span>
      </div>
      {href && <ArrowUpRight className="absolute right-2.5 top-3 h-3.5 w-3.5 text-ink-faint sm:right-4 sm:top-[1.375rem]" />}
      <span className={`line-clamp-2 font-semibold leading-tight text-ink sm:text-[26px] sm:leading-none ${short ? "text-xl" : "text-base"}`}>{value}</span>
      {note && <p className="mt-1 text-xs leading-snug text-ink-faint sm:mt-1.5">{note}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block min-w-0 rounded-card hover:opacity-90">{body}</Link> : body;
}
