"use client";

import { useState } from "react";
import { usePhotos } from "@/lib/avatars";
import { cn, initials } from "@/lib/utils";

/**
 * A person as a circle: their own photo, else the default photo HR set, else
 * initials. Pass the employee id wherever it's known (no id = initials).
 */
export function Avatar({ name, id, className, imgClassName }: { name: string; id?: string | null; className?: string; imgClassName?: string }) {
  const photos = usePhotos();
  const p = id ? photos[id] : undefined;
  const [broken, setBroken] = useState<string | null>(null);
  const src = p?.url ?? null;
  if (src && broken !== src) {
    return (
      <span className={cn("relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-ink", className)} data-photo={id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className={cn("h-full w-full object-cover", imgClassName)} onError={() => setBroken(src)} draggable={false} />
      </span>
    );
  }
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-white", className)} aria-hidden={false}>
      {initials(name)}
    </span>
  );
}
