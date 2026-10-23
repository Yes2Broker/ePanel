import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-white", className)}>
      {initials(name)}
    </div>
  );
}
