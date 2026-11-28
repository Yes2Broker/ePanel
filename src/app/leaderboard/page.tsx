"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Crown, Flag, Flame, Footprints, Landmark, Rocket, Sparkles, Star, Trophy } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo";
import { MonthField } from "@/components/ui/pickers";
import { Fireworks } from "@/components/leaderboard/fireworks";
import { SlotNumber, SlotReel } from "@/components/leaderboard/slot";
import { useSession } from "@/context/session-context";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import type { LbPlayer, LbWinner } from "@/types";

/*
 * A standalone, full-screen "game lobby" (opened in a new tab from the panel):
 * no sidebar, top bar or Assist, its own dark world, fonts and colours.
 */

type Cat = "visits" | "closures";
const TAB: Record<Cat, string> = { visits: "Visits", closures: "Closures" };
const TAB_ICON: Record<Cat, typeof Trophy> = { visits: Footprints, closures: Trophy };
const UNIT: Record<Cat, [string, string]> = { visits: ["visit", "visits"], closures: ["closure", "closures"] };
const unit = (c: Cat, n: number) => `${n} ${UNIT[c][n === 1 ? 0 : 1]}`;
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long" });
const monthYear = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const today = () => new Date().toISOString().slice(0, 10);
const first = (n: string) => n.split(" ")[0];
const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const MEDAL = ["gold", "silver", "bronze"] as const;
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
  const { user, loading } = useSession();
  const router = useRouter();
  // Render the lobby only after mounting, so the server HTML (empty world) always matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [loading, user, router]);
  if (!mounted || loading || !user) return <Shell />;
  return <Lobby name={user.name} />;
}

function Lobby({ name }: { name: string }) {
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
  const prev = (p: LbPlayer) => (cat === "visits" ? p.prevVisits : p.prevClosures);
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
  // Hall of fame: only months that crowned someone (a skipped month has nothing to reveal).
  const hall = (data?.hall ?? []).filter((h) => h.winners.length > 0);
  const nextFirst = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return d.toLocaleDateString("en-IN", { day: "numeric", month: "long" }); })();
  const isRevealed = (m: string) => revealed[m] ?? store.get(`y2b-lb-reveal-${m}`) === "1";
  const hidden = past && !!data?.winners.length && !isRevealed(data.month);

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

  // Reels spin on load and on every category switch; gold confetti once a day.
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

      <div className={cn("relative mx-auto px-4 pb-6 sm:px-6 lg:px-10", me ? "pb-44 lg:pb-10" : "lg:pb-10")} style={{ zoom }}>
        {/* Slim header */}
        <header className="flex items-center gap-3 py-3 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-2">
            <LogoIcon size={34} className="shrink-0 rounded-lg bg-white p-0.5" />
            <span className="lb-display hidden text-xl tracking-wider text-white/80 sm:inline">Y2B Leaderboard</span>
          </div>
          <div className="hidden flex-col items-center gap-1.5 lg:flex">
            <h1 className="lb-display lb-title text-5xl leading-none">{monthLong(month).toUpperCase()} CHAMPIONSHIP</h1>
            {data?.live ? <Countdown endsAt={data.endsAt} /> : data && <span className="lb-pill"><Flag className="h-4 w-4" aria-hidden /> Final results</span>}
          </div>
          <div className="ml-auto flex items-center justify-end gap-2">
            <span className="flex items-center gap-2" aria-label={`Signed in as ${name}`}>
              <Hex name={name} size={30} tone="plain" />
              <span className="hidden max-w-[140px] truncate text-sm font-semibold xl:inline">{name}</span>
            </span>
            <Link href="/dashboard" className="lb-btn whitespace-nowrap">← <span className="hidden sm:inline">Back to </span>ePanel</Link>
          </div>
        </header>

        {/* Phone/tablet title */}
        <div className="mt-2 text-center lg:hidden">
          <h1 className="lb-display lb-title text-[44px] leading-[0.95] sm:text-6xl">{monthLong(month).toUpperCase()} CHAMPIONSHIP</h1>
          <div className="mt-2 flex justify-center">{data?.live ? <Countdown endsAt={data.endsAt} /> : data && <span className="lb-pill"><Flag className="h-4 w-4" aria-hidden /> Final results</span>}</div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <div role="tablist" aria-label="Category" className="grid w-full max-w-md grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur">
            {(["visits", "closures"] as Cat[]).map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
                className={cn("lb-display relative min-h-12 overflow-hidden rounded-xl text-2xl tracking-wider transition", cat === c ? "lb-tab-on" : "text-white/60 hover:text-white")}>
                {(() => { const I = TAB_ICON[c]; return <span className="inline-flex items-center justify-center gap-2"><I className="h-5 w-5" aria-hidden />{TAB[c]}</span>; })()}
              </button>
            ))}
          </div>
          <div className="lb-month"><MonthField ariaLabel="Month" value={month} onChange={pick} min={data?.minMonth} max={thisMonth()} /></div>
        </div>

        {error && (
          <div className="lb-glass mx-auto mt-5 max-w-lg p-4 text-center text-sm">
            {error} <button onClick={reload} className="ml-2 font-semibold text-[#22D3EE] underline">Try again</button>
          </div>
        )}

        <div key={cat} className="lb-fade">
          {/* Podium hero */}
          <section aria-label="Podium" className="relative mx-auto mt-6 max-w-5xl">
            <div className="lb-rays" aria-hidden />
            {loading && !data ? (
              <div className="flex h-72 items-end justify-center gap-3">{[110, 150, 90].map((h, i) => <div key={i} className="lb-glass w-1/4 animate-pulse" style={{ height: h }} />)}</div>
            ) : hidden ? (
              <Lever month={data!.month} onPull={() => reveal(data!.month)} big />
            ) : (
              <Podium groups={podium} cat={cat} val={val} rank={rank} spin={spin} pool={rows.map((p) => p.name)} />
            )}
            {!hidden && !loading && !podium.length && (
              <p className="relative mt-3 text-center text-base font-semibold text-[#F5C542]">
                {past ? `No ${UNIT[cat][1]} that month.` : <>No {UNIT[cat][1]} yet — the first one takes the crown <Crown className="inline h-5 w-5 align-[-3px]" aria-hidden /></>}
              </p>
            )}
          </section>

          <div className="mt-5 text-center">
            <p className="lb-display text-3xl tracking-wide text-[#FF3B5C] sm:text-4xl">CLIMB THE BOARD. BE THE CHAMPION.</p>
            <p className="mt-1 text-xs text-white/55">Visits = site visits done · Closures = tokens, from the daily reports · Champions are crowned on the 1st · Ties share the title</p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
            {/* Live table */}
            <section aria-label="Live competition" className="lb-glass min-w-0 self-start overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="lb-display text-2xl tracking-wide">{data?.live ? <><span className="lb-live" aria-hidden /> Live competition · {cat === "visits" ? "Visits" : "Closures"}</> : "Final standings"}</h2>
                <span className="text-xs text-white/55">{rows.length} racing</span>
              </div>
              {loading && !data ? (
                <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div>
              ) : !rows.length ? (
                <p className="p-6 text-center text-sm text-white/60">No one from Sales is racing yet.</p>
              ) : (
                <ol aria-label={`${cat === "visits" ? "Visits" : "Closures"} ranking`}>
                  {rows.map((p) => {
                    const r = rank(p), was = prev(p), moved = r == null || was == null ? 0 : was - r;
                    const mine = p.me;
                    return (
                      <li key={p.id} className={cn("lb-row flex items-center gap-3 px-4 py-3", mine && "lb-row-me")}>
                        <RankChip rank={r} />
                        <Hex name={p.name} size={40} tone={r != null && r <= 3 ? MEDAL[Math.min(r, 3) - 1] : "plain"} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                            <span className="truncate">{p.name}</span>
                            {mine && <span className="shrink-0 rounded-full bg-[#F5C542] px-1.5 text-[10px] font-bold text-[#2a1650]">YOU</span>}
                            {p.streak && <span className="lb-flame shrink-0 text-orange-400" title="Reported every working day this week" aria-label="Reported every working day this week"><Flame className="h-4 w-4" aria-hidden /></span>}
                            {p.titles > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[#F5C542]" title={`${p.titles} monthly ${p.titles === 1 ? "title" : "titles"}`}><Trophy className="h-3.5 w-3.5" aria-hidden />{p.titles > 1 ? `×${p.titles}` : ""}</span>}
                          </p>
                          <p className="truncate text-xs text-white/50">{p.designation || "Sales"}</p>
                        </div>
                        {moved !== 0 && (
                          <span className={cn("shrink-0 text-xs font-bold", moved > 0 ? "text-[#34D399]" : "text-[#FBBF24]")}
                            aria-label={moved > 0 ? `Up ${moved} since yesterday` : `Down ${-moved} since yesterday`}>
                            {moved > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}{Math.abs(moved)}
                          </span>
                        )}
                        <span className="lb-num w-12 shrink-0 text-right text-xl font-bold">{val(p) > 0 ? val(p) : <span className="text-white/35">—</span>}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
              {me && data?.live && <YourSpot me={me} ranked={ranked} cat={cat} val={val} rank={rank} />}
              {/* Hall of fame */}
              <aside aria-label="Hall of fame" className="space-y-3">
                <h2 className="lb-display flex items-center gap-2 text-3xl tracking-wide text-[#F5C542]"><Landmark className="h-7 w-7" aria-hidden /> Hall of fame</h2>
                {!hall.length ? (
                  <div className="lb-glass p-4 text-sm text-white/60">First champions crowned on {nextFirst}. Could it be you?</div>
                ) : hall.slice(0, 12).map((h) => (
                  <HallCard key={h.month} month={h.month} winners={h.winners} revealed={isRevealed(h.month)}
                    onPull={() => reveal(h.month)} onOpen={() => pick(h.month)} />
                ))}
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={cn("lb-pill lb-num", d < 3 && "lb-pill-hot")} role="timer" aria-label={`Ends in ${d} days ${h} hours ${m} minutes`}>
      ⏱ Ends in {d}d {pad(h)}h {pad(m)}m <span className="text-white/60">{pad(sec)}s</span>
    </span>
  );
}

function Podium({ groups, cat, val, rank, spin, pool }: {
  groups: LbPlayer[][]; cat: Cat; val: (p: LbPlayer) => number; rank: (p: LbPlayer) => number | null; spin: number; pool: string[];
}) {
  // Left #2, centre #1, right #3.
  const spots = [1, 0, 2];
  return (
    <div className="relative grid grid-cols-3 items-end gap-2 sm:gap-4">
      {spots.map((i) => {
        const g = groups[i];
        const tone = MEDAL[i];
        const h = [150, 112, 88][i];
        return (
          <div key={i} className="flex min-w-0 flex-col items-center" data-podium={i + 1}>
            {g ? (
              <>
                <div className="flex -space-x-3">{g.slice(0, 3).map((p) => <Hex key={p.id} name={p.name} size={i === 0 ? 76 : 60} tone={tone} stars />)}</div>
                <div className={cn("lb-reel mt-2 w-full max-w-[220px] text-sm sm:text-base", g.some((p) => p.me) && "lb-reel-me")}>
                  <SlotReel name={g.map((p) => first(p.name)).join(" & ")} pool={pool.map(first)} spin={spin} delay={[300, 0, 600][i]} />
                </div>
                <SlotNumber value={val(g[0])} spin={spin} delay={[300, 0, 600][i]}
                  className={cn("lb-num mt-1 font-extrabold", i === 0 ? "text-5xl text-[#F5C542] sm:text-6xl" : "text-4xl text-white sm:text-5xl")} />
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/55">{UNIT[cat][val(g[0]) === 1 ? 0 : 1]}</p>
              </>
            ) : (
              <div className="mb-3 flex flex-col items-center opacity-70">
                <Hex name="?" size={i === 0 ? 76 : 60} tone="empty" />
                <p className="mt-2 text-xs text-white/50">{i === 0 ? "Crown up for grabs" : "Open spot"}</p>
              </div>
            )}
            <div className={cn("lb-pedestal w-full", `lb-ped-${tone}`, i === 0 && "lb-sweep")} style={{ height: h }}>
              <span className={cn("lb-coin lb-display", `lb-coin-${g ? tone : "empty"}`, i === 0 ? "lb-coin-big" : "")}>
                {g ? rank(g[0]) : "?"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YourSpot({ me, ranked, cat, val, rank }: {
  me: LbPlayer; ranked: LbPlayer[]; cat: Cat; val: (p: LbPlayer) => number; rank: (p: LbPlayer) => number | null;
}) {
  const mine = val(me), r = rank(me);
  const ahead = ranked.filter((p) => val(p) > mine).sort((a, b) => val(a) - val(b))[0];
  const behind = ranked.filter((p) => val(p) < mine && !p.me).sort((a, b) => val(b) - val(a))[0];
  const gap = ahead ? val(ahead) - mine : 0;
  const lead = behind ? mine - val(behind) : 0;
  const pct = ahead ? Math.round((mine / val(ahead)) * 100) : 100;
  return (
    <section aria-label="Your spot" key={`${cat}-${mine}`} className="lb-glass lb-spot fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 p-4 lg:static">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="lb-display text-4xl text-[#F5C542]">{r ? `You're #${r}` : "You're up next"}</span>
        <span className="text-sm font-semibold text-white/85">
          {r == null ? <>Your first {UNIT[cat][0]} puts you on the board <Rocket className="inline h-4 w-4 align-[-2px]" aria-hidden /></>
            : !ahead ? <><Crown className="inline h-4 w-4 align-[-2px] text-[#F5C542]" aria-hidden /> Leading{behind ? ` by ${unit(cat, lead)}` : ""} — hold the crown!</>
            : `${unit(cat, gap)} to pass ${first(ahead.name)}`}
        </span>
      </div>
      {r != null && ahead && (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to #${rank(ahead)}`}>
          <div className="lb-bar h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
      {r != null && behind && lead <= 2 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#FBBF24]"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {first(behind.name)} is {unit(cat, lead)} behind you</p>
      )}
    </section>
  );
}

function HallCard({ month, winners, revealed, onPull, onOpen }: {
  month: string; winners: LbWinner[]; revealed: boolean; onPull: () => void; onOpen?: () => void;
}) {
  const by = (c: Cat) => winners.filter((w) => w.category === c);
  return (
    <div className="lb-glass lb-hall p-4">
      <div className="flex items-center justify-between">
        <p className="lb-display flex items-center gap-2 text-2xl tracking-wide"><Trophy className="h-5 w-5 text-[#F5C542]" aria-hidden /> {monthYear(month)}</p>
        {onOpen && <button onClick={onOpen} className="text-xs font-semibold text-[#22D3EE] hover:underline">View</button>}
      </div>
      {!revealed ? (
        <Lever month={month} onPull={onPull} />
      ) : (
        <div className="mt-2 space-y-2">
          {(["visits", "closures"] as Cat[]).map((c) => by(c).length > 0 && (
            <div key={c} className="flex items-center gap-2.5 rounded-xl bg-white/5 px-2.5 py-2">
              <Hex name={by(c)[0].name} size={34} tone="gold" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Top {c}</p>
                <p className="truncate text-sm font-semibold">{by(c).map((w) => w.name).join(" & ")}</p>
              </div>
              <span className="lb-num font-bold text-[#F5C542]">{by(c)[0].value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Lever({ month, onPull, big }: { month: string; onPull: () => void; big?: boolean }) {
  return (
    <div className={cn("relative flex flex-col items-center text-center", big ? "gap-4 py-10" : "mt-3 gap-3")}>
      {big && <p className="lb-display text-3xl tracking-wide sm:text-4xl">Who ruled {monthLong(month)}?</p>}
      <div className={cn("lb-reel flex w-full max-w-xs items-center justify-center text-white/50", big ? "h-12 text-2xl" : "h-10")}>? ? ?</div>
      <button onClick={onPull} className={cn("lb-lever lb-display tracking-wider", big ? "min-h-14 px-10 text-2xl" : "min-h-11 px-6 text-xl")}>
        <span className="inline-flex items-center gap-2">Pull to reveal <Sparkles className="h-5 w-5" aria-hidden /></span>
      </button>
    </div>
  );
}

function RankChip({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="lb-chip text-white/40" aria-label="Not ranked yet">—</span>;
  if (rank <= 3) return <span className={cn("lb-chip lb-display text-lg", `lb-coin-${MEDAL[rank - 1]}`)} aria-label={`Rank ${rank}`}>{rank}</span>;
  return <span className="lb-chip lb-num text-sm font-bold text-white/80" aria-label={`Rank ${rank}`}>{rank}</span>;
}

/** Initials in a glowing hexagon frame (3 stars on the podium). */
function Hex({ name, size, tone, stars }: { name: string; size: number; tone: "gold" | "silver" | "bronze" | "plain" | "empty"; stars?: boolean }) {
  return (
    <div className="relative flex flex-col items-center" aria-hidden>
      {stars && <span className={cn("lb-stars inline-flex gap-0.5", `lb-stars-${tone}`)}>{[0, 1, 2].map((i) => <Star key={i} style={{ width: size / 5, height: size / 5 }} fill="currentColor" strokeWidth={0} />)}</span>}
      <div className={cn("lb-hex", `lb-hex-${tone}`)} style={{ width: size, height: size * 1.1 }}>
        <div className="lb-hex-in lb-display" style={{ fontSize: size * 0.4 }}>{name === "?" ? "?" : initials(name)}</div>
      </div>
    </div>
  );
}

/** Glows, slow light rays and floating sparkles. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="lb-glow" style={{ left: "-10%", top: "-5%", background: "#3b5bff" }} />
      <div className="lb-glow" style={{ right: "-12%", top: "10%", background: "#a21caf" }} />
      <div className="lb-glow" style={{ left: "30%", top: "45%", background: "#7c3aed", opacity: 0.25 }} />
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} className="lb-spark" style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 60 + 5}%`, animationDelay: `${(i % 6) * 0.7}s`, animationDuration: `${5 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

const CSS = `
.lb-world{background:radial-gradient(120% 80% at 50% 0%,#24124f 0%,#130a35 45%,#0a0a24 100%);font-variant-numeric:tabular-nums;isolation:isolate}
.lb-display{font-family:"Bebas Neue","Oswald",Impact,"Arial Narrow",sans-serif;font-weight:400;letter-spacing:.02em}
.lb-num{font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums}
.lb-title{background:linear-gradient(180deg,#fff 0%,#FFE7A3 55%,#F5C542 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(245,197,66,.45)) drop-shadow(0 0 40px rgba(168,85,247,.35))}
.lb-pill{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;padding:.45rem 1rem;font-size:.9rem;font-weight:700;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.5);box-shadow:0 0 18px rgba(34,211,238,.3);color:#E6FBFF}
.lb-pill-hot{background:rgba(255,59,92,.15);border-color:rgba(255,59,92,.7);box-shadow:0 0 22px rgba(255,59,92,.45);animation:lbPulse 1.6s ease-in-out infinite}
.lb-tab-on{background:linear-gradient(180deg,#FF5A75,#FF3B5C 50%,#c81e45);color:#fff;box-shadow:0 0 20px rgba(255,59,92,.55),inset 0 1px 0 rgba(255,255,255,.35)}
.lb-glass{border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(160,140,255,.25);box-shadow:0 0 0 1px rgba(255,255,255,.03) inset,0 10px 40px rgba(0,0,0,.35),0 0 24px rgba(124,58,237,.15);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.lb-month button{background:rgba(255,255,255,.08)!important;color:#fff!important;border-color:rgba(255,255,255,.2)!important}
.lb-glow{position:absolute;width:55vw;max-width:640px;aspect-ratio:1;border-radius:50%;filter:blur(90px);opacity:.35}
.lb-rays{position:absolute;left:50%;top:40%;width:900px;height:900px;margin:-450px 0 0 -450px;pointer-events:none;background:repeating-conic-gradient(from 0deg,rgba(245,197,66,.09) 0deg 6deg,transparent 6deg 18deg);-webkit-mask:radial-gradient(circle,#000 0%,transparent 62%);mask:radial-gradient(circle,#000 0%,transparent 62%);animation:lbSpin 60s linear infinite}
.lb-spark{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 8px 2px rgba(255,255,255,.7);animation:lbFloat 6s ease-in-out infinite;opacity:0}
.lb-reel{border-radius:12px;background:linear-gradient(180deg,#fff,#e9e4ff);color:#1a1040;border:2px solid rgba(245,197,66,.6);box-shadow:inset 0 6px 10px rgba(0,0,0,.18),inset 0 -6px 10px rgba(0,0,0,.12),0 0 16px rgba(245,197,66,.25)}
.lb-reel-me{border-color:#22D3EE;box-shadow:inset 0 6px 10px rgba(0,0,0,.18),0 0 20px rgba(34,211,238,.6)}
.lb-pedestal{position:relative;border-radius:14px 14px 6px 6px;display:flex;justify-content:center;padding-top:14px;overflow:hidden;transform:perspective(500px) rotateX(8deg);transform-origin:bottom}
.lb-pedestal::before{content:"";position:absolute;inset:0 0 auto 0;height:14px;background:rgba(255,255,255,.25);border-radius:14px 14px 0 0}
.lb-ped-gold{background:linear-gradient(180deg,#FF3B5C 0%,#b3123a 60%,#5a0b2a 100%);border:2px solid #F5C542;box-shadow:0 0 40px rgba(255,59,92,.5),0 0 20px rgba(245,197,66,.4)}
.lb-ped-silver{background:linear-gradient(180deg,#5b4bb8 0%,#2f2675 70%,#1b1550 100%);border:1px solid rgba(203,213,225,.6);box-shadow:0 0 24px rgba(124,58,237,.35)}
.lb-ped-bronze{background:linear-gradient(180deg,#4b3aa3 0%,#2a2168 70%,#181248 100%);border:1px solid rgba(217,140,90,.6);box-shadow:0 0 22px rgba(124,58,237,.3)}
.lb-sweep::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);animation:lbSweep 4s ease-in-out infinite}
.lb-chip{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15)}
.lb-coin{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;font-size:28px;line-height:1;z-index:1}
.lb-coin-big{width:64px;height:64px;font-size:40px;animation:lbCoin 2.4s ease-in-out infinite}
.lb-coin-gold{background:radial-gradient(circle at 35% 30%,#FFF3C4,#F5C542 45%,#B8860B 100%);color:#5b3a00;box-shadow:0 0 22px rgba(245,197,66,.8),inset 0 -3px 0 rgba(0,0,0,.2)}
.lb-coin-silver{background:radial-gradient(circle at 35% 30%,#fff,#cbd5e1 50%,#7c8797 100%);color:#2d3440;box-shadow:0 0 16px rgba(226,232,240,.6),inset 0 -3px 0 rgba(0,0,0,.2)}
.lb-coin-bronze{background:radial-gradient(circle at 35% 30%,#FFD8B5,#d98c5a 50%,#8a4b25 100%);color:#3d1d08;box-shadow:0 0 16px rgba(217,140,90,.6),inset 0 -3px 0 rgba(0,0,0,.2)}
.lb-coin-empty{background:rgba(255,255,255,.08);border:2px dashed rgba(245,197,66,.6);color:#F5C542;box-shadow:0 0 20px rgba(245,197,66,.35)}
.lb-hex{clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);padding:3px;display:flex}
.lb-hex-in{flex:1;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#3a2a8a,#1a1048);color:#fff}
.lb-hex-gold{background:linear-gradient(160deg,#FFF3C4,#F5C542,#B8860B);filter:drop-shadow(0 0 10px rgba(245,197,66,.75))}
.lb-hex-silver{background:linear-gradient(160deg,#fff,#cbd5e1,#64748b);filter:drop-shadow(0 0 8px rgba(226,232,240,.6))}
.lb-hex-bronze{background:linear-gradient(160deg,#FFD8B5,#d98c5a,#8a4b25);filter:drop-shadow(0 0 8px rgba(217,140,90,.6))}
.lb-hex-plain{background:linear-gradient(160deg,#22D3EE,#7c3aed);filter:drop-shadow(0 0 6px rgba(34,211,238,.35))}
.lb-hex-empty{background:repeating-linear-gradient(45deg,rgba(245,197,66,.7) 0 4px,rgba(245,197,66,.2) 4px 8px);filter:drop-shadow(0 0 12px rgba(245,197,66,.5))}
.lb-stars{letter-spacing:.1em;line-height:1;margin-bottom:2px}
.lb-stars svg{filter:drop-shadow(0 0 4px currentColor)}
.lb-stars-gold{color:#F5C542;text-shadow:0 0 8px rgba(245,197,66,.9)}.lb-stars-silver{color:#e2e8f0;text-shadow:0 0 6px rgba(226,232,240,.8)}.lb-stars-bronze{color:#e8a274;text-shadow:0 0 6px rgba(217,140,90,.8)}
.lb-row{border-bottom:1px solid rgba(255,255,255,.07);transition:background .2s,box-shadow .2s}
.lb-row:last-child{border-bottom:0}
.lb-row:hover{background:rgba(124,58,237,.14);box-shadow:inset 3px 0 0 #22D3EE,0 0 24px rgba(124,58,237,.25)}
.lb-row-me{background:linear-gradient(90deg,rgba(245,197,66,.18),rgba(245,197,66,.04));box-shadow:inset 3px 0 0 #F5C542}
.lb-live{display:inline-block;width:9px;height:9px;border-radius:50%;background:#FF3B5C;box-shadow:0 0 10px #FF3B5C;margin-right:6px;vertical-align:middle;animation:lbPulse 1.2s ease-in-out infinite}
.lb-flame{display:inline-block;animation:lbFlicker 1.2s ease-in-out infinite}
.lb-spot{border-color:rgba(245,197,66,.6);box-shadow:0 0 28px rgba(245,197,66,.25),0 10px 40px rgba(0,0,0,.45);background:rgba(30,18,70,.82);animation:lbPop .5s ease-out}
.lb-bar{background:linear-gradient(90deg,#22D3EE,#a855f7,#F5C542);box-shadow:0 0 12px rgba(245,197,66,.6);transition:width .8s cubic-bezier(.2,.8,.2,1)}
.lb-hall{border-color:rgba(245,197,66,.3)}
.lb-lever{border-radius:999px;color:#2a1650;background:linear-gradient(180deg,#FFE08A,#F5C542 50%,#d99a00);box-shadow:0 5px 0 #8a5a00,0 0 24px rgba(245,197,66,.6);transition:transform .1s,box-shadow .1s}
.lb-lever:active{transform:translateY(5px);box-shadow:0 0 0 #8a5a00,0 0 24px rgba(245,197,66,.6)}
.lb-btn{display:inline-flex;align-items:center;gap:.3rem;min-height:40px;padding:0 .9rem;border-radius:999px;font-size:.85rem;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(160,140,255,.35);color:#fff;transition:background .2s,box-shadow .2s}
.lb-btn:hover{background:rgba(124,58,237,.3);box-shadow:0 0 16px rgba(124,58,237,.45)}
.lb-fade{animation:lbFade .6s ease-out}
@keyframes lbFade{from{opacity:0}to{opacity:1}}
@keyframes lbSpin{to{transform:rotate(360deg)}}
@keyframes lbFloat{0%{opacity:0;transform:translateY(10px) scale(.6)}50%{opacity:.9}100%{opacity:0;transform:translateY(-40px) scale(1)}}
@keyframes lbSweep{0%,55%{left:-60%}100%{left:130%}}
@keyframes lbCoin{0%,100%{transform:translateY(0);box-shadow:0 0 22px rgba(245,197,66,.8)}50%{transform:translateY(-3px);box-shadow:0 0 36px rgba(245,197,66,1)}}
@keyframes lbPulse{50%{opacity:.55}}
@keyframes lbFlicker{0%,100%{transform:scale(1) rotate(-3deg)}50%{transform:scale(1.15) rotate(3deg)}}
@keyframes lbPop{0%{transform:scale(.97);box-shadow:0 0 60px rgba(245,197,66,.6)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.lb-world *,.lb-world *::before,.lb-world *::after{animation:none!important;transition:none!important}.lb-spark{opacity:.5}}
`;
