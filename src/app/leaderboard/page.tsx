"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Clock, Crown, Flag, Flame, Lock, Minus, Pencil, Sparkles, Star, Trophy, Users } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo";
import { usePhotos } from "@/lib/avatars";
import { MonthField } from "@/components/ui/pickers";
import { Fireworks } from "@/components/leaderboard/fireworks";
import { SlotNumber } from "@/components/leaderboard/slot";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import type { LbPlayer, LbWinner } from "@/types";

/*
 * The leaderboard: a standalone, full-screen page (opened in a new tab from the
 * panel) in its own dark "championship" look. Only people with the Leaderboard
 * switch see it (the database checks too). Everyone in Sales races.
 */

type Cat = "visits" | "closures";
const TAB: Record<Cat, string> = { visits: "Visits", closures: "Closures" };
const UNIT: Record<Cat, [string, string]> = { visits: ["visit", "visits"], closures: ["closure", "closures"] };
const UNIT_CAP: Record<Cat, [string, string]> = { visits: ["Visit", "Visits"], closures: ["Closure", "Closures"] };
const unit = (c: Cat, n: number) => `${n} ${UNIT[c][n === 1 ? 0 : 1]}`;
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long" });
const monthYear = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const monthShort = (m: string) => { const d = new Date(`${m}-01T00:00:00`); return `${d.toLocaleDateString("en-IN", { month: "short" })} '${String(d.getFullYear()).slice(2)}`; };
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);
const first = (n: string) => n.split(" ")[0];
const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
type Medal = "gold" | "silver" | "bronze";
const MEDAL: Medal[] = ["gold", "silver", "bronze"];
const GOLD = ["#F5C542", "#FFE08A", "#FFB800", "#FFF3C4"];

export default function LeaderboardPage() {
  return <Suspense fallback={<Shell />}><Gate /></Suspense>;
}

/** Dark empty world while the session loads (no white flash). */
function Shell() {
  return <div className="lb-world fixed inset-0"><style dangerouslySetInnerHTML={{ __html: CSS }} /></div>;
}

/** Same login as the panel; signed out → login → back here. */
function Gate() {
  const { user, loading, permissions } = useSession();
  const router = useRouter();
  // Render only after mounting, so the server HTML (empty world) always matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [loading, user, router]);
  if (!mounted || loading || !user) return <Shell />;
  // The "Leaderboard" switch (Permissions page); the database checks it too.
  if (!permissions?.leaderboard) return <NoAccess />;
  return <Lobby name={user.name} meId={user.id} />;
}

function NoAccess() {
  return (
    <div className="lb-world flex min-h-[100dvh] items-center justify-center p-6 text-center text-white">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lb-card max-w-sm space-y-3 p-6">
        <Lock className="mx-auto h-8 w-8 text-[#F5C542]" aria-hidden />
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="text-sm text-white/70">The Leaderboard isn&apos;t turned on for you yet. Ask Admin if you&apos;d like to see it.</p>
        <Link href="/dashboard" className="lb-btn mx-auto">Back to ePanel</Link>
      </div>
    </div>
  );
}

function Lobby({ name, meId }: { name: string; meId: string }) {
  const q = useSearchParams();
  const router = useRouter();
  const [month, setMonth] = useState(q.get("month") || thisMonth());
  const [cat, setCat] = useState<Cat>(q.get("tab") === "closures" ? "closures" : "visits");
  const { data, loading, error, reload } = useApi(() => api.leaderboard(month), [month]);
  const [spin, setSpin] = useState(0);
  const [fire, setFire] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [wide, setWide] = useState(false);

  const val = (p: LbPlayer) => (cat === "visits" ? p.visits : p.closures);
  const rank = (p: LbPlayer) => (cat === "visits" ? p.rankVisits : p.rankClosures);
  // vs Last Week: rank change when ranked both times, else the change in the count.
  const vsWeek = (p: LbPlayer): number | null => {
    const r = rank(p), wr = cat === "visits" ? p.weekRankVisits : p.weekRankClosures;
    const wc = cat === "visits" ? p.weekVisits : p.weekClosures;
    if (r != null && wr != null) return wr - r;
    if (wc == null) return null;
    return val(p) - wc;
  };
  // Ranked first (by rank, then name), then everyone at 0 alphabetically.
  const rows = useMemo(() => [...(data?.players ?? [])].sort((a, b) =>
    (rank(a) ?? 1e9) - (rank(b) ?? 1e9) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cat]);
  const ranked = rows.filter((p) => rank(p) != null);
  // Podium spots = the top three ranks; ties share a spot.
  const podium = useMemo(() => {
    const groups: LbPlayer[][] = [];
    for (const p of ranked) {
      const g = groups[groups.length - 1];
      if (g && rank(g[0]) === rank(p)) g.push(p); else if (groups.length < 3) groups.push([p]); else break;
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.map((p) => p.id + rank(p)).join()]);
  const me = rows.find((p) => p.me);
  const past = !!data && !data.live;
  // Hall of fame: only months that crowned someone.
  const hall = (data?.hall ?? []).filter((h) => h.winners.length > 0);
  const nextFirst = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" }); })();
  const isRevealed = (m: string) => revealed[m] ?? store.get(`y2b-lb-reveal-${m}`) === "1";
  const hidden = past && !!data?.winners.length && !isRevealed(data.month);
  const team = rows.reduce((t, p) => t + val(p), 0);
  const goal = data?.goals?.[cat] ?? null;

  const pick = (m: string) => { setMonth(m); router.replace(m !== thisMonth() ? `/leaderboard?month=${m}` : "/leaderboard"); };
  const reveal = (m: string) => {
    store.set(`y2b-lb-reveal-${m}`, "1"); setRevealed((r) => ({ ...r, [m]: true }));
    setFire((f) => f + 1);
    if (data?.month === m) setSpin((s) => s + 1);
  };

  // Big screens scale everything up.
  useEffect(() => {
    const mq = matchMedia("(min-width: 1600px)");
    const on = () => setWide(mq.matches); on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const zoom = wide ? 1.2 : 1;

  // Numbers roll on load and on every category switch; gold confetti once a day.
  useEffect(() => { if (data) setSpin((s) => s + 1); }, [data?.month, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data || store.get("y2b-lb-confetti") === today()) return;
    store.set("y2b-lb-confetti", today());
    const t = setTimeout(() => setConfetti((c) => c + 1), 900);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <div className="lb-world relative min-h-[100dvh] w-full text-white [overflow-x:clip]">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" />
      <Fireworks run={fire} />
      <Fireworks run={confetti} colors={GOLD} bursts={false} duration={2600} />
      <Backdrop />

      <div className={cn("relative mx-auto px-4 pb-6 sm:px-6 lg:px-8", me && data?.live ? "pb-44 lg:pb-10" : "lg:pb-10")} style={{ zoom }}>
        {/* Header: logo · title + tabs · countdown */}
        <header className="lb-header -mx-4 flex flex-wrap items-center gap-3 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoIcon size={40} className="ring-0" />
            <div className="hidden leading-tight sm:block">
              <p className="text-xl font-extrabold tracking-tight">Yes2Broker</p>
              <p className="text-[11px] text-white/70">Rewriting Real Estate Rules</p>
            </div>
          </div>
          <div className="order-3 flex w-full flex-col items-center gap-2 lg:order-none lg:w-auto">
            <div className="flex items-center gap-2 sm:gap-3">
              <Laurel className="hidden h-12 w-7 text-[#F5C542] sm:block" />
              <Trophy className="lb-trophy h-8 w-8 shrink-0 text-[#F5C542] sm:h-10 sm:w-10" aria-hidden />
              <h1 className="lb-display lb-title text-center text-[34px] leading-none sm:text-5xl">{monthLong(month).toUpperCase()} CHAMPIONSHIP</h1>
              <Laurel className="hidden h-12 w-7 -scale-x-100 text-[#F5C542] sm:block" />
            </div>
            <div role="tablist" aria-label="Category" className="lb-tabs grid grid-cols-2 rounded-full p-1">
              {(["visits", "closures"] as Cat[]).map((c) => (
                <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
                  className={cn("min-h-10 min-w-[7.5rem] rounded-full px-5 text-sm font-semibold transition", cat === c ? "lb-tab-on" : "text-white/80 hover:text-white")}>
                  {TAB[c]}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:justify-self-end">
            {data?.live ? <Countdown endsAt={data.endsAt} /> : data && (
              <span className="lb-countdown flex items-center gap-2 px-3 py-2"><Flag className="h-5 w-5 text-[#F5C542]" aria-hidden /><span className="text-sm font-semibold">Final results</span></span>
            )}
          </div>
        </header>

        {/* Small controls: month, who's signed in, back to the panel */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-sm">
          <div className="lb-month mr-auto"><MonthField ariaLabel="Month" value={month} onChange={pick} min={data?.minMonth} max={thisMonth()} /></div>
          <span className="flex items-center gap-2" aria-label={`Signed in as ${name}`}>
            <Photo id={meId} name={name} size={30} tone="plain" />
            <span className="hidden max-w-[160px] truncate font-semibold xl:inline">{name}</span>
          </span>
          <Link href="/dashboard" className="lb-btn whitespace-nowrap">Back to ePanel</Link>
        </div>

        {error && (
          <div className="lb-card mx-auto mt-5 max-w-lg p-4 text-center text-sm">
            {error} <button onClick={reload} className="ml-2 font-semibold text-[#7FB2FF] underline">Try again</button>
          </div>
        )}

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="min-w-0 space-y-5">
            {/* Podium */}
            <section aria-label="Podium" className="relative">
              <div className="lb-rays" aria-hidden />
              {loading && !data ? (
                <div className="flex h-72 items-end justify-center gap-3">{[110, 150, 90].map((h, i) => <div key={i} className="lb-card w-1/4 animate-pulse" style={{ height: h }} />)}</div>
              ) : hidden ? (
                <Lever month={data!.month} onPull={() => reveal(data!.month)} big />
              ) : (
                <Podium groups={podium} cat={cat} val={val} rank={rank} spin={spin} />
              )}
              {!hidden && !loading && !podium.length && (
                <p className="relative mt-3 text-center text-base font-semibold text-[#F5C542]">
                  {past ? `No ${UNIT[cat][1]} that month.` : <>No {UNIT[cat][1]} yet — the first one takes the crown <Crown className="inline h-5 w-5 align-[-3px]" aria-hidden /></>}
                </p>
              )}
            </section>

            {/* Live Rankings */}
            <section aria-label="Live competition" className="lb-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                  <Trophy className="h-5 w-5 text-[#F5C542]" aria-hidden /> {data?.live ? "Live Rankings" : "Final Rankings"}
                </h2>
                <span className="text-xs text-white/60">{rows.length} racing</span>
              </div>
              {loading && !data ? (
                <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />)}</div>
              ) : !rows.length ? (
                <p className="p-6 text-center text-sm text-white/60">No one from Sales is racing yet.</p>
              ) : (
                <>
                  {/* Desktop / tablet: table */}
                  <table aria-label={`${TAB[cat]} ranking`} className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="lb-thead text-left">
                        <th className="w-12 py-2.5 pl-5 font-semibold">#</th>
                        <th className="py-2.5 font-semibold">Team Member</th>
                        <th className="py-2.5 font-semibold">Designation</th>
                        <th className="py-2.5 text-center font-semibold">{TAB[cat]}</th>
                        <th className="py-2.5 font-semibold">vs Last Week</th>
                        <th className="py-2.5 pr-5 font-semibold">Streak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => {
                        const r = rank(p);
                        return (
                          <tr key={p.id} className={cn("lb-row", p.me && "lb-row-me")} aria-current={p.me ? "true" : undefined}>
                            <td className="py-2.5 pl-5"><RankNum rank={r} /></td>
                            <td className="py-2.5">
                              <span className="flex items-center gap-3">
                                <Photo id={p.id} name={p.name} size={38} tone={r != null && r <= 3 ? MEDAL[r - 1] : "plain"} />
                                <span className="font-semibold">{p.name}{p.me && <span className="ml-2 rounded-full bg-[#F5C542] px-1.5 text-[10px] font-bold text-[#1a1650]">YOU</span>}</span>
                                {p.titles > 0 && <TitlesBadge n={p.titles} />}
                              </span>
                            </td>
                            <td className="py-2.5 text-white/75">{p.designation || "Sales"}</td>
                            <td className="py-2.5 text-center text-lg font-bold tabular-nums">{val(p) > 0 ? val(p) : <span className="text-white/40">—</span>}</td>
                            <td className="py-2.5"><VsWeek d={vsWeek(p)} /></td>
                            <td className="py-2.5 pr-5"><StreakCell weeks={p.streakWeeks ?? 0} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {/* Phones: stacked rows */}
                  <ol aria-label={`${TAB[cat]} ranking`} className="md:hidden">
                    {rows.map((p) => {
                      const r = rank(p);
                      return (
                        <li key={p.id} className={cn("lb-row flex items-center gap-3 px-4 py-3", p.me && "lb-row-me")}>
                          <RankNum rank={r} />
                          <Photo id={p.id} name={p.name} size={40} tone={r != null && r <= 3 ? MEDAL[r - 1] : "plain"} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <span className="break-words">{p.name}</span>
                              {p.me && <span className="shrink-0 rounded-full bg-[#F5C542] px-1.5 text-[10px] font-bold text-[#1a1650]">YOU</span>}
                            </p>
                            <p className="text-xs text-white/60">{p.designation || "Sales"}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><VsWeek d={vsWeek(p)} /><StreakCell weeks={p.streakWeeks ?? 0} /></p>
                          </div>
                          <span className="w-10 shrink-0 text-right text-xl font-bold tabular-nums">{val(p) > 0 ? val(p) : <span className="text-white/40">—</span>}</span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>
            <p className="px-1 text-xs text-white/55">Visits = site visits done · Closures = tokens, from the daily reports · vs Last Week = change since the same day last week · Streak = weeks with a report every working day · Champions are crowned on the 1st · Ties share the title</p>
          </div>

          {/* Right column */}
          <div className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
            {me && data?.live && <YourSpot me={me} meId={meId} ranked={ranked} cat={cat} val={val} rank={rank} />}
            {data && (goal != null || data.canSetGoal) && (
              <TeamGoal month={data.month} cat={cat} team={team} goal={goal} canEdit={data.canSetGoal} onSaved={reload} />
            )}
            <aside aria-label="Hall of fame" className="lb-card p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <Crown className="h-7 w-7 text-[#F5C542]" aria-hidden />
                <div>
                  <h2 className="text-lg font-bold">Hall of Fame</h2>
                  <p className="text-xs text-white/60">Past Monthly Champions</p>
                </div>
              </div>
              {!hall.length ? (
                <p className="mt-3 text-sm text-white/65">First champions crowned on {nextFirst}. Could it be you?</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {hall.slice(0, 6).map((h) => (
                    <HallMonth key={h.month} month={h.month} winners={h.winners} revealed={isRevealed(h.month)}
                      onPull={() => reveal(h.month)} onOpen={() => pick(h.month)} />
                  ))}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Ends in 2d 11h" box (ticks every second). */
function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (
    <div className={cn("lb-countdown flex items-center gap-3 px-3 py-2 sm:px-4", d < 3 && "lb-countdown-hot")} role="timer"
      aria-label={`Ends in ${d} days ${h} hours ${m} minutes`} title={`${m} min`}>
      <Clock className="h-7 w-7 text-white sm:h-8 sm:w-8" aria-hidden />
      <div className="leading-tight">
        <p className="text-xs text-white/80 sm:text-sm">Ends in</p>
        <p className="text-xl font-extrabold tabular-nums text-[#F5C542] sm:text-2xl">{d}d {h}h</p>
      </div>
    </div>
  );
}

/** Round photo (own, else default, else initials) with a gold / silver / bronze / blue ring. */
function Photo({ id, name, size, tone }: { id?: string; name: string; size: number; tone: Medal | "plain" | "blue" | "empty" }) {
  const photos = usePhotos();
  const url = id ? photos[id]?.url : null;
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span className={cn("lb-ring shrink-0", `lb-ring-${tone}`)} style={{ width: size, height: size, padding: Math.max(2, Math.round(size / 28)) }} aria-hidden>
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#1d2a6b] font-bold text-white" style={{ fontSize: size * 0.34 }}>
        {url && broken !== url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" data-photo={id} draggable={false} className="h-full w-full object-cover" onError={() => setBroken(url)} />
          : name === "?" ? "?" : initials(name)}
      </span>
    </span>
  );
}

/** A laurel branch (drawn here, no emoji / image). Mirror it with -scale-x-100. */
function Laurel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 48" className={className} aria-hidden fill="currentColor">
      <path d="M18 46 C10 40 6 30 7 18 C7.5 12 10 6 13 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {[[11, 40, -40], [8.5, 33, -30], [7.5, 26, -20], [7.8, 19, -10], [9.5, 12, 0], [12, 6, 10]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2.4" ry="5" transform={`rotate(${r} ${x} ${y}) translate(-3.6 0)`} />
      ))}
      {[[12.5, 37, 40], [10.5, 30, 35], [10, 23, 30], [10.8, 16, 25], [12.8, 9.5, 20]].map(([x, y, r], i) => (
        <ellipse key={`r${i}`} cx={x} cy={y} rx="2.2" ry="4.6" transform={`rotate(${r} ${x} ${y}) translate(3.4 0)`} />
      ))}
    </svg>
  );
}

function Podium({ groups, cat, val, rank, spin }: {
  groups: LbPlayer[][]; cat: Cat; val: (p: LbPlayer) => number; rank: (p: LbPlayer) => number | null; spin: number;
}) {
  // Left #2, centre #1, right #3.
  return (
    <div className="relative">
      <div className="relative grid grid-cols-3 items-end gap-1.5 sm:gap-3">
        {[1, 0, 2].map((i) => {
          const g = groups[i];
          const tone = MEDAL[i];
          const big = i === 0;
          return (
            <div key={i} className="relative flex min-w-0 flex-col items-center" data-podium={i + 1}>
              <div className={cn("relative z-10 flex items-center justify-center", big ? "-mb-6 sm:-mb-10" : "-mb-5 sm:-mb-8")}>
                {big && g && <Laurel className="absolute -left-6 top-1/2 h-24 w-12 -translate-y-1/2 text-[#F5C542] sm:-left-10 sm:h-36 sm:w-16" />}
                {big && g && <Laurel className="absolute -right-6 top-1/2 h-24 w-12 -translate-y-1/2 -scale-x-100 text-[#F5C542] sm:-right-10 sm:h-36 sm:w-16" />}
                <div className="flex -space-x-4">
                  {(g ?? [null]).slice(0, 3).map((p, j) => (
                    <span key={p?.id ?? j} className={cn("lb-photo-wrap", big ? "lb-size-xl" : "lb-size-lg")}>
                      <Photo id={p?.id} name={p?.name ?? "?"} size={0} tone={g ? tone : "empty"} />
                    </span>
                  ))}
                </div>
              </div>
              <div className={cn("lb-pedestal w-full", `lb-ped-${tone}`, big ? "lb-ped-1" : i === 1 ? "lb-ped-2" : "lb-ped-3", big && "lb-sweep")}>
                <div className="relative flex h-full flex-col items-center justify-center gap-0.5 px-1 pt-5 text-center sm:pt-8">
                  <span className="flex items-center gap-1">
                    <Laurel className={cn("h-7 w-3.5 sm:h-9 sm:w-5", `lb-laurel-${tone}`)} />
                    <span className={cn("lb-display leading-none", big ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl", `lb-num-${tone}`)}>{g ? rank(g[0]) : "?"}</span>
                    <Laurel className={cn("h-7 w-3.5 -scale-x-100 sm:h-9 sm:w-5", `lb-laurel-${tone}`)} />
                  </span>
                  {g ? (
                    <>
                      <p className={cn("max-w-full break-words font-bold leading-tight", big ? "text-base sm:text-2xl" : "text-sm sm:text-xl", `lb-name-${tone}`)}>{g.map((p) => first(p.name)).join(" & ")}</p>
                      <p className={cn("font-semibold", big ? "text-sm sm:text-lg" : "text-xs sm:text-base", `lb-name-${tone}`)}>
                        <SlotNumber value={val(g[0])} spin={spin} delay={[300, 0, 600][i]} /> {UNIT_CAP[cat][val(g[0]) === 1 ? 0 : 1]}
                      </p>
                    </>
                  ) : <p className={cn("text-xs sm:text-sm", `lb-name-${tone}`)}>{i === 0 ? "Crown up for grabs" : "Open spot"}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lb-podium-base" aria-hidden />
    </div>
  );
}

function YourSpot({ me, meId, ranked, cat, val, rank }: {
  me: LbPlayer; meId: string; ranked: LbPlayer[]; cat: Cat; val: (p: LbPlayer) => number; rank: (p: LbPlayer) => number | null;
}) {
  const mine = val(me), r = rank(me);
  const ahead = ranked.filter((p) => val(p) > mine).sort((a, b) => val(a) - val(b))[0];
  const behind = ranked.filter((p) => val(p) < mine && !p.me).sort((a, b) => val(b) - val(a))[0];
  const gap = ahead ? val(ahead) - mine : 0;
  const lead = behind ? mine - val(behind) : 0;
  const pct = ahead ? Math.round((mine / val(ahead)) * 100) : 100;
  return (
    <section aria-label="Your spot" key={`${cat}-${mine}`}
      className="lb-card lb-spot fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 p-3 sm:p-4 lg:static lg:p-5">
      <h2 className="hidden items-center gap-2 text-lg font-bold lg:flex"><Star className="h-6 w-6 fill-[#F5C542] text-[#F5C542]" aria-hidden /> Your Spot</h2>
      <div className="flex items-center gap-3 lg:mt-3 lg:gap-4">
        <span className="hidden lg:block"><Photo id={meId} name={me.name} size={96} tone="blue" /></span>
        <span className="lg:hidden"><Photo id={meId} name={me.name} size={48} tone="blue" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold lg:text-2xl">{r ? <>You&apos;re <span className="lb-display text-3xl text-[#F5C542] lg:text-5xl">#{r}</span></> : "You're up next"}</p>
          <p className="text-sm text-white/85 lg:text-base">
            {r == null ? `Your first ${UNIT[cat][0]} puts you on the board`
              : !ahead ? <span className="inline-flex items-center gap-1.5"><Crown className="h-4 w-4 text-[#F5C542]" aria-hidden /> Leading{behind ? ` by ${unit(cat, lead)}` : ""} — hold the crown!</span>
              : `${unit(cat, gap)} to pass ${first(ahead.name)}`}
          </p>
          {r != null && ahead && (
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to #${rank(ahead)}`}>
              <div className="lb-bar h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
          {r != null && behind && lead <= 2 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#FBBF24] lg:text-sm"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {first(behind.name)} is {unit(cat, lead)} behind you</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Team goal for the month (Admin sets it with the pencil). Hidden for others when not set. */
function TeamGoal({ month, cat, team, goal, canEdit, onSaved }: {
  month: string; cat: Cat; team: number; goal: number | null; canEdit: boolean; onSaved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEditing(false); }, [month, cat]);
  const pct = goal ? Math.round((team / goal) * 100) : 0;   // can pass 100%: the bar just stays full
  const save = async (target: number | null) => {
    setBusy(true);
    try { await api.leaderboardGoalSet(month, cat, target); toast(target ? "Team goal saved." : "Team goal removed."); setEditing(false); onSaved(); }
    catch (e) { toast(errorMessage(e), "error"); } finally { setBusy(false); }
  };
  return (
    <section aria-label="Team goal" className="lb-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <Users className="h-6 w-6 text-[#7FB2FF]" aria-hidden />
        <h2 className="flex-1 text-lg font-bold">Team Goal</h2>
        {canEdit && !editing && (
          <button type="button" aria-label="Edit team goal" onClick={() => { setValue(goal ? String(goal) : ""); setEditing(true); }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/75 hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" aria-hidden /></button>
        )}
      </div>
      {editing ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); const n = Number(value); if (!Number.isInteger(n) || n <= 0) return toast("Enter a whole number above 0.", "error"); save(n); }}>
          <label className="block text-sm text-white/80">{monthLong(month)} target ({UNIT[cat][1]})
            <input type="number" inputMode="numeric" min={1} step={1} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Team goal for ${UNIT[cat][1]}`}
              className="mt-1 block min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[#7FB2FF]" autoFocus />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="lb-btn lb-btn-primary">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="lb-btn">Cancel</button>
            {goal != null && <button type="button" disabled={busy} onClick={() => save(null)} className="lb-btn ml-auto">Remove goal</button>}
          </div>
        </form>
      ) : goal == null ? (
        <p className="mt-2 text-sm text-white/65">No team goal for {UNIT[cat][1]} this month. Use the pencil to set one.</p>
      ) : (
        <>
          <p className="mt-3 text-xl font-bold sm:text-2xl">Team: <span className="text-[#F5C542]">{team} / {goal}</span> <span className="text-base font-semibold">{UNIT[cat][1]}</span></p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Team goal progress">
              <div className="lb-goal-bar h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-lg font-bold tabular-nums">{pct}%</span>
          </div>
          <p className="mt-2 text-center text-sm italic text-white/80">Together, let&apos;s hit the goal!</p>
        </>
      )}
    </section>
  );
}

function HallMonth({ month, winners, revealed, onPull, onOpen }: {
  month: string; winners: LbWinner[]; revealed: boolean; onPull: () => void; onOpen: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-white/85">{monthYear(month)}</p>
        <button onClick={onOpen} className="text-xs font-semibold text-[#7FB2FF] hover:underline">View</button>
      </div>
      {!revealed ? <Lever month={month} onPull={onPull} /> : (
        <div className="grid grid-cols-3 gap-2">
          {winners.map((w) => (
            <div key={w.category + w.id} className="flex flex-col items-center text-center">
              <Photo id={w.id} name={w.name} size={62} tone="gold" />
              <p className="mt-1.5 text-sm font-semibold leading-tight">{first(w.name)}</p>
              <p className="text-xs text-white/65">({monthShort(month)})</p>
              <p className="text-[11px] text-[#F5C542]">Top {w.category}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Lever({ month, onPull, big }: { month: string; onPull: () => void; big?: boolean }) {
  return (
    <div className={cn("relative flex flex-col items-center text-center", big ? "gap-4 py-10" : "gap-3")}>
      {big && <p className="lb-display text-3xl tracking-wide sm:text-4xl">Who ruled {monthLong(month)}?</p>}
      <div className={cn("lb-reel flex w-full max-w-xs items-center justify-center text-white/50", big ? "h-12 text-2xl" : "h-10")}>? ? ?</div>
      <button onClick={onPull} className={cn("lb-lever font-bold", big ? "min-h-14 px-10 text-xl" : "min-h-11 px-6 text-base")}>
        <span className="inline-flex items-center gap-2">Pull to reveal <Sparkles className="h-5 w-5" aria-hidden /></span>
      </button>
    </div>
  );
}

function RankNum({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="inline-block w-6 text-center text-white/40" aria-label="Not ranked yet">—</span>;
  return <span className={cn("inline-block w-6 text-center text-lg font-bold tabular-nums", rank === 1 ? "text-[#F5C542]" : rank === 2 ? "text-[#D6DCE6]" : rank === 3 ? "text-[#E9A06B]" : "text-[#9DB8FF]")} aria-label={`Rank ${rank}`}>{rank}</span>;
}

/** Green up arrow +n; grey dash 0; grey down arrow for a drop (never red). */
function VsWeek({ d }: { d: number | null }) {
  if (d == null || d === 0) return <span className="inline-flex items-center gap-1.5 text-white/60" aria-label="No change since last week"><Minus className="h-4 w-4" aria-hidden /> 0</span>;
  if (d > 0) return <span className="inline-flex items-center gap-1.5 font-semibold text-[#34D399]" aria-label={`Up ${d} since last week`}><ArrowUp className="h-4 w-4" aria-hidden /> +{d}</span>;
  return <span className="inline-flex items-center gap-1.5 text-white/60" aria-label={`Down ${-d} since last week`}><ArrowDown className="h-4 w-4" aria-hidden /> {d}</span>;
}

function StreakCell({ weeks }: { weeks: number }) {
  if (!weeks) return <span className="text-white/40" aria-label="No streak">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[#FFD27A]" aria-label={`${weeks} week streak: a report every working day`}>
      <Flame className="lb-flame h-4 w-4 text-[#FF8A3D]" aria-hidden /> {weeks} {weeks === 1 ? "week" : "weeks"}
    </span>
  );
}

function TitlesBadge({ n }: { n: number }) {
  return <span className="inline-flex items-center gap-0.5 text-xs text-[#F5C542]" title={`${n} monthly ${n === 1 ? "title" : "titles"}`} aria-label={`${n} monthly ${n === 1 ? "title" : "titles"}`}><Trophy className="h-3.5 w-3.5" aria-hidden />{n > 1 ? `×${n}` : ""}</span>;
}

/** Blue / violet glows, slow light rays and floating sparkles. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="lb-glow" style={{ left: "-12%", top: "-8%", background: "#2f5bff" }} />
      <div className="lb-glow" style={{ right: "-15%", top: "5%", background: "#5b2bd6" }} />
      <div className="lb-glow" style={{ left: "25%", top: "40%", background: "#1d3bb8", opacity: 0.25 }} />
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i} className="lb-spark" style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 60 + 5}%`, animationDelay: `${(i % 6) * 0.7}s`, animationDuration: `${5 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

const CSS = `
.lb-world{background:radial-gradient(120% 80% at 50% 0%,#18287a 0%,#0e1752 45%,#08103a 100%);font-variant-numeric:tabular-nums;isolation:isolate}
.lb-display{font-family:"Bebas Neue","Oswald",Impact,"Arial Narrow",sans-serif;font-weight:400;letter-spacing:.02em}
.lb-header{background:linear-gradient(180deg,rgba(6,12,48,.85),rgba(10,18,64,.55));border-bottom:1px solid rgba(127,178,255,.18)}
.lb-title{background:linear-gradient(180deg,#fff 0%,#FFE7A3 45%,#F5C542 75%,#C8941E 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35)) drop-shadow(0 0 18px rgba(245,197,66,.35))}
.lb-trophy{filter:drop-shadow(0 0 10px rgba(245,197,66,.7))}
.lb-tabs{background:rgba(10,20,70,.75);border:1px solid rgba(127,178,255,.35);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.lb-tab-on{background:linear-gradient(180deg,#5aa0ff,#2f6bff);color:#fff;box-shadow:0 0 18px rgba(63,128,255,.6)}
.lb-countdown{border-radius:16px;border:2px solid #F5C542;background:rgba(8,14,52,.85);box-shadow:0 0 18px rgba(245,197,66,.25)}
.lb-countdown-hot{animation:lbPulse 1.8s ease-in-out infinite}
.lb-card{border-radius:18px;background:linear-gradient(180deg,rgba(22,36,110,.72),rgba(12,22,80,.78));border:1px solid rgba(127,178,255,.28);box-shadow:0 10px 40px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.lb-thead{background:rgba(30,50,140,.55);color:rgba(255,255,255,.85)}
.lb-row{border-top:1px solid rgba(127,178,255,.14);transition:background .2s}
.lb-row:hover{background:rgba(63,128,255,.12)}
.lb-row-me{background:linear-gradient(90deg,rgba(47,107,255,.55),rgba(47,107,255,.28))!important}
.lb-btn{display:inline-flex;align-items:center;gap:.3rem;min-height:38px;padding:0 .9rem;border-radius:999px;font-size:.85rem;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(127,178,255,.35);color:#fff}
.lb-btn:hover{background:rgba(63,128,255,.25)}
.lb-btn-primary{background:linear-gradient(180deg,#5aa0ff,#2f6bff);border-color:transparent}
.lb-month button{background:rgba(255,255,255,.08)!important;color:#fff!important;border-color:rgba(127,178,255,.35)!important}
.lb-glow{position:absolute;width:55vw;max-width:640px;aspect-ratio:1;border-radius:50%;filter:blur(90px);opacity:.35}
.lb-rays{position:absolute;left:50%;top:35%;width:900px;height:900px;margin:-450px 0 0 -450px;pointer-events:none;background:repeating-conic-gradient(from 0deg,rgba(255,226,140,.08) 0deg 5deg,transparent 5deg 16deg);-webkit-mask:radial-gradient(circle,#000 0%,transparent 60%);mask:radial-gradient(circle,#000 0%,transparent 60%);animation:lbSpin 70s linear infinite}
.lb-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(255,255,255,.7);animation:lbFloat 6s ease-in-out infinite;opacity:0}
.lb-ring{display:inline-block;border-radius:999px}
.lb-ring>span{width:100%;height:100%}
.lb-ring-gold{background:linear-gradient(145deg,#FFF3C4,#F5C542 40%,#B8860B);box-shadow:0 0 22px rgba(245,197,66,.65)}
.lb-ring-silver{background:linear-gradient(145deg,#ffffff,#c9d1dd 45%,#7b8696);box-shadow:0 0 16px rgba(226,232,240,.45)}
.lb-ring-bronze{background:linear-gradient(145deg,#FFD8B5,#d98c5a 45%,#8a4b25);box-shadow:0 0 16px rgba(217,140,90,.5)}
.lb-ring-blue{background:linear-gradient(145deg,#9cc3ff,#2f6bff 50%,#1b3fa8);box-shadow:0 0 18px rgba(63,128,255,.55)}
.lb-ring-plain{background:linear-gradient(145deg,#c9d6ff,#6b7fd6);opacity:.95}
.lb-ring-empty{background:repeating-linear-gradient(45deg,rgba(245,197,66,.7) 0 4px,rgba(245,197,66,.2) 4px 8px)}
.lb-photo-wrap .lb-ring{display:block}
.lb-size-xl .lb-ring{width:150px!important;height:150px!important;padding:6px!important}
.lb-size-lg .lb-ring{width:118px!important;height:118px!important;padding:5px!important}
.lb-size-xl .lb-ring>span{font-size:46px!important}.lb-size-lg .lb-ring>span{font-size:36px!important}
@media (max-width:640px){.lb-size-xl .lb-ring{width:88px!important;height:88px!important;padding:4px!important}.lb-size-lg .lb-ring{width:70px!important;height:70px!important;padding:3px!important}.lb-size-xl .lb-ring>span{font-size:28px!important}.lb-size-lg .lb-ring>span{font-size:22px!important}}
.lb-pedestal{position:relative;border-radius:14px 14px 6px 6px;overflow:hidden}
.lb-pedestal::before{content:"";position:absolute;inset:0 0 auto 0;height:22%;background:linear-gradient(180deg,rgba(255,255,255,.45),rgba(255,255,255,0));border-radius:14px 14px 0 0}
.lb-ped-1{height:230px}.lb-ped-2{height:185px}.lb-ped-3{height:165px}
@media (max-width:640px){.lb-ped-1{height:150px}.lb-ped-2{height:125px}.lb-ped-3{height:115px}}
.lb-ped-gold{background:linear-gradient(180deg,#FFE58A 0%,#F2C14E 30%,#C8941E 70%,#8a6410 100%);box-shadow:0 0 40px rgba(245,197,66,.45),inset 0 -10px 20px rgba(0,0,0,.25)}
.lb-ped-silver{background:linear-gradient(180deg,#f2f4f8 0%,#aeb7c4 35%,#6b7584 75%,#3f4652 100%);box-shadow:0 0 22px rgba(200,210,230,.25),inset 0 -10px 20px rgba(0,0,0,.3)}
.lb-ped-bronze{background:linear-gradient(180deg,#f3b98c 0%,#d98c5a 35%,#9c5a2e 75%,#5e3214 100%);box-shadow:0 0 22px rgba(217,140,90,.3),inset 0 -10px 20px rgba(0,0,0,.3)}
.lb-num-gold{color:#fff8dc;text-shadow:0 2px 0 #8a6410,0 0 12px rgba(255,255,255,.5)}.lb-num-silver{color:#fff;text-shadow:0 2px 0 #3f4652}.lb-num-bronze{color:#fff3e6;text-shadow:0 2px 0 #5e3214}
.lb-name-gold{color:#3a2600}.lb-name-silver{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)}.lb-name-bronze{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.lb-laurel-gold{color:#8a6410}.lb-laurel-silver{color:#e8ecf2}.lb-laurel-bronze{color:#ffe0c2}
.lb-sweep::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);animation:lbSweep 4.5s ease-in-out infinite}
.lb-podium-base{height:22px;margin:-6px -4% 0;border-radius:50%;background:radial-gradient(ellipse at center,rgba(245,197,66,.55),rgba(245,197,66,0) 70%);box-shadow:0 0 30px rgba(245,197,66,.35)}
.lb-reel{border-radius:12px;background:linear-gradient(180deg,#fff,#e6ecff);color:#1a1650;border:2px solid rgba(245,197,66,.6)}
.lb-lever{border-radius:999px;color:#1a1650;background:linear-gradient(180deg,#FFE08A,#F5C542 50%,#d99a00);box-shadow:0 5px 0 #8a5a00,0 0 24px rgba(245,197,66,.6)}
.lb-lever:active{transform:translateY(5px);box-shadow:0 0 0 #8a5a00}
.lb-spot{border-color:rgba(127,178,255,.45);background:linear-gradient(180deg,rgba(26,42,120,.95),rgba(14,24,84,.95))}
.lb-bar{background:linear-gradient(90deg,#2f6bff,#5aa0ff);box-shadow:0 0 12px rgba(63,128,255,.6);transition:width .8s cubic-bezier(.2,.8,.2,1)}
.lb-goal-bar{background:linear-gradient(90deg,#2f6bff,#5aa0ff);transition:width .8s}
.lb-flame{animation:lbFlicker 1.3s ease-in-out infinite}
@keyframes lbSpin{to{transform:rotate(360deg)}}
@keyframes lbFloat{0%{opacity:0;transform:translateY(10px) scale(.6)}50%{opacity:.9}100%{opacity:0;transform:translateY(-40px) scale(1)}}
@keyframes lbSweep{0%,55%{left:-60%}100%{left:130%}}
@keyframes lbPulse{50%{box-shadow:0 0 30px rgba(245,197,66,.6)}}
@keyframes lbFlicker{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.15) rotate(3deg)}}
@media (prefers-reduced-motion:reduce){.lb-world *,.lb-world *::before,.lb-world *::after{animation:none!important;transition:none!important}.lb-spark{opacity:.5}}
`;
