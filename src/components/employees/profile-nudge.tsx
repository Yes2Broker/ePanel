"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { useSession } from "@/context/session-context";
import { photosLoaded, usePhotos } from "@/lib/avatars";

const SNOOZE_DAYS = 3;
const key = (id: string) => `y2b-photo-nudge-later:${id}`;

/** True when the signed-in person has no OWN photo yet (known only after photos loaded). */
export function useNeedsOwnPhoto() {
  const { user } = useSession();
  const photos = usePhotos();
  return !!user && photosLoaded() && !photos[user.id]?.hasOwn;
}

/** Dashboard: "Complete your profile" until they upload their own photo. "Later" hides it for 3 days. */
export function ProfileNudge() {
  const { user } = useSession();
  const needs = useNeedsOwnPhoto();
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => {
    if (!user) return;
    try { setSnoozed(Number(localStorage.getItem(key(user.id)) ?? 0) > Date.now()); } catch { setSnoozed(false); }
  }, [user]);
  if (!user || !needs || snoozed) return null;
  const later = () => {
    try { localStorage.setItem(key(user.id), String(Date.now() + SNOOZE_DAYS * 86400e3)); } catch { /* private mode */ }
    setSnoozed(true);
  };
  return (
    <section aria-label="Complete your profile" className="flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-soft p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand"><UserRound className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Complete your profile</p>
        <p className="text-sm text-ink-muted">Add your own photo so your team can see you.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={later} className="min-h-10 rounded-xl px-3 text-sm font-medium text-ink-muted hover:bg-white">Later</button>
        <Link href="/profile?add=photo" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-dark">
          <Camera className="h-4 w-4" aria-hidden /> Add photo
        </Link>
      </div>
    </section>
  );
}
