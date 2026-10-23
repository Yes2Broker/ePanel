import Link from "next/link";
import { LucideIcon, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function SummaryCard({
  icon: Icon, label, value, note, href,
}: { icon: LucideIcon; label: string; value: string | number; note?: string; href?: string }) {
  const body = (
    <Card className="h-full p-4 transition-colors">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand">
          <Icon className="h-3.5 w-3.5 text-ink" strokeWidth={2.25} />
        </div>
        <span className="text-sm text-ink-muted">{label}</span>
        {href && <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-ink-faint" />}
      </div>
      <span className="text-[26px] font-semibold leading-none text-ink">{value}</span>
      {note && <p className="mt-1.5 text-xs text-ink-faint">{note}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-card hover:opacity-90">{body}</Link> : body;
}
