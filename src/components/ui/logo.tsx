import Image from "next/image";
import { cn } from "@/lib/utils";

/** Full Yes2Broker logo (wide). 900×170 source, transparent background. */
export function FullLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/yes2broker-logo.webp" alt="Yes2Broker — Rewriting Real Estate Rules" width={900} height={170} priority={priority} className={cn("h-auto w-full", className)} />;
}

/** Square Y2B icon, on white with rounded corners. */
export function LogoIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-surface-border", className)} style={{ width: size, height: size }}>
      <Image src="/brand/y2b-icon.png" alt="Yes2Broker" width={size} height={size} className="h-full w-full object-contain" />
    </span>
  );
}
