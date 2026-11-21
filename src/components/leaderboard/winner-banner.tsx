"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Trophy, X } from "lucide-react";
import { Fireworks } from "@/components/leaderboard/fireworks";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const monthOf = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long" });

/**
 * Dashboard: last month's champions (with fireworks, the first time each person
 * sees them) for a few days after the 1st, and a strip with my place in this
 * month's race.
 */
export function WinnerBanner() {
  const { user } = useSession();
  const { data } = useApi(() => api.leaderboardBanner().catch(() => null));
  const [hidden, setHidden] = useState(false);
  const [fire, setFire] = useState(0);
  const champs = data?.champions;
  const key = champs ? `y2b-lb-${champs.month}-${user?.id}` : "";

  useEffect(() => {
    if (!key) return;
    if (store.get(`${key}-hide`)) { setHidden(true); return; }
    if (!store.get(`${key}-fw`)) { store.set(`${key}-fw`, "1"); setFire((f) => f + 1); }
  }, [key]);

  if (!data) return null;
  const visits = champs?.winners.filter((w) => w.category === "visits") ?? [];
  const closures = champs?.winners.filter((w) => w.category === "closures") ?? [];
  const iWon = champs?.winners.some((w) => w.me);
  const race = data.race;

  return (
    <>
      <Fireworks run={fire} />
      {champs && !hidden && (
        <section aria-label={`${monthOf(champs.month)} champions`}
          className="relative overflow-hidden rounded-card border-2 border-amber-300 bg-gradient-to-br from-[#1D2B73] via-[#2a1f6e] to-[#4a1b6b] p-4 text-white shadow-lg sm:p-5">
          <button aria-label="Hide champions" onClick={() => { store.set(`${key}-hide`, "1"); setHidden(true); }}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">🏆 {monthOf(champs.month)} champions</p>
          {iWon && <p className="mt-1 text-lg font-extrabold">🎉 Congratulations, that&apos;s you!</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[["Top site visits", visits, "visits"], ["Top closures", closures, "closures"]].map(([label, ws, u]) => (
              (ws as typeof visits).length > 0 && (
                <div key={label as string} className="rounded-xl bg-white/10 px-3 py-2.5">
                  <p className="text-xs text-white/70">{label as string}</p>
                  <p className="text-base font-bold">{(ws as typeof visits).map((w) => w.name).join(" & ")}</p>
                  <p className="text-sm text-amber-200">{(ws as typeof visits)[0].value} {u as string}</p>
                </div>
              )
            ))}
          </div>
          <Link href={`/leaderboard?month=${champs.month}`} className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-pill bg-amber-300 px-4 text-sm font-bold text-[#2a1f6e]">
            See the leaderboard <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      )}
      {race && (
        <Link href="/leaderboard" className="flex items-center gap-3 rounded-card border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-sm shadow-card hover:border-amber-300">
          <Trophy className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <span className="min-w-0 flex-1 text-ink">
            <b>This month: #{race.rankVisits} in visits</b>
            {race.visitsToNext != null ? ` (${race.visitsToNext} to move up)` : race.visits > 0 ? " 👑" : ""}
            {" · "}<b>#{race.rankClosures} in closures</b>
            {race.closuresToNext != null ? ` (${race.closuresToNext} to move up)` : race.closures > 0 ? " 👑" : ""}
            <span className="text-ink-muted"> · {race.daysLeft} {race.daysLeft === 1 ? "day" : "days"} left</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        </Link>
      )}
    </>
  );
}
