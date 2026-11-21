"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Crown, Flame, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorBanner, Loading, PageHeader, Skeleton } from "@/components/ui/page";
import { MonthField } from "@/components/ui/pickers";
import { Fireworks } from "@/components/leaderboard/fireworks";
import { SlotNumber, SlotReel } from "@/components/leaderboard/slot";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import type { LbPlayer } from "@/types";

type Cat = "visits" | "closures";
const LABEL: Record<Cat, string> = { visits: "Site visits", closures: "Closures" };
const UNIT: Record<Cat, [string, string]> = { visits: ["visit", "visits"], closures: ["closure", "closures"] };
const unit = (c: Cat, n: number) => `${n} ${UNIT[c][n === 1 ? 0 : 1]}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export default function LeaderboardPage() {
  return <Suspense fallback={<Loading />}><Board /></Suspense>;
}

function Board() {
  const q = useSearchParams();
  const router = useRouter();
  const [month, setMonth] = useState(q.get("month") || thisMonth());
  const [cat, setCat] = useState<Cat>((q.get("tab") as Cat) === "closures" ? "closures" : "visits");
  const { data, loading, error, reload } = useApi(() => api.leaderboard(month), [month]);
  const [spin, setSpin] = useState(0);
  const [fire, setFire] = useState(0);
  const [revealed, setRevealed] = useState(true);

  const pick = (m: string) => { setMonth(m); router.replace(`/leaderboard?month=${m}`); };
  const val = (p: LbPlayer) => (cat === "visits" ? p.visits : p.closures);
  const rank = (p: LbPlayer) => (cat === "visits" ? p.rankVisits : p.rankClosures);
  const prev = (p: LbPlayer) => (cat === "visits" ? p.prevVisits : p.prevClosures);
  const rows = useMemo(() => [...(data?.players ?? [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cat]);
  const top = rows[0] ? val(rows[0]) : 0;
  const me = rows.find((p) => p.me);
  const winners = (data?.winners ?? []).filter((w) => w.category === cat);
  const past = data && !data.live;

  // A finished month with champions: pull the lever to reveal (once per month, then it just shows).
  useEffect(() => {
    if (!data || data.live || !data.winners.length) { setRevealed(true); return; }
    setRevealed(store.get(`y2b-lb-reveal-${data.month}`) === "1");
  }, [data]);
  useEffect(() => { if (data?.live) setSpin((s) => s + 1); }, [data?.live, data?.month, cat]);
  const pull = () => { setRevealed(true); setSpin((s) => s + 1); if (data) store.set(`y2b-lb-reveal-${data.month}`, "1"); };

  const pool = rows.map((p) => p.name);
  const podium = rows.slice(0, 3);

  return (
    <div className="space-y-4 pt-1 md:space-y-5 md:pt-4">
      <Fireworks run={fire} />
      <PageHeader title="Leaderboard"
        subtitle={data ? (data.live ? `The ${monthName(data.month).split(" ")[0]} race · ${data.daysLeft} ${data.daysLeft === 1 ? "day" : "days"} left` : `${monthName(data.month)} · final`) : "Who's on top this month"}
        actions={<MonthField ariaLabel="Month" value={month} onChange={pick} min={data?.minMonth} max={thisMonth()} />} />
      <ErrorBanner message={error} onRetry={reload} />

      <div role="tablist" aria-label="Leaderboard" className="inline-flex rounded-pill border border-surface-border bg-white p-1">
        {(["visits", "closures"] as Cat[]).map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
            className={cn("min-h-10 rounded-pill px-4 text-sm font-medium transition", cat === c ? "bg-brand text-white" : "text-ink-muted hover:text-ink")}>
            {LABEL[c]}
          </button>
        ))}
      </div>

      {/* The machine */}
      <section aria-label={`${LABEL[cat]} jackpot`}
        className="relative overflow-hidden rounded-card border-2 border-amber-300 bg-gradient-to-br from-[#1D2B73] via-[#2a1f6e] to-[#4a1b6b] p-4 text-white shadow-lg sm:p-6">
        <Lights />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">🎰 {past ? `${monthName(data!.month)} champions` : "Monthly jackpot"}</p>
          {data?.live && data.daysLeft <= 7 && (
            <span className="inline-flex animate-pulse items-center gap-1 rounded-pill bg-rose-500/90 px-2.5 py-1 text-xs font-semibold">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Final {data.daysLeft} {data.daysLeft === 1 ? "day" : "days"}
            </span>
          )}
        </div>

        {loading && !data ? (
          <div className="relative mt-4 grid grid-cols-3 gap-2 sm:gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 bg-white/10" />)}</div>
        ) : !rows.length || top === 0 ? (
          <p className="relative mt-6 pb-2 text-center text-sm text-white/80">
            {past ? "No one scored this month." : `No ${LABEL[cat].toLowerCase()} yet this month. The first one takes the crown 👑`}
          </p>
        ) : past && winners.length && !revealed ? (
          <div className="relative mt-5 flex flex-col items-center gap-4 pb-2 text-center">
            <p className="text-lg font-bold sm:text-xl">Who won {LABEL[cat].toLowerCase()} in {monthName(data!.month).split(" ")[0]}?</p>
            <div className="w-full max-w-xs rounded-xl border-2 border-amber-300 bg-black/30 text-xl">
              <div className="flex h-11 items-center justify-center text-white/60">? ? ?</div>
            </div>
            <button onClick={pull} className="min-h-12 rounded-pill bg-gradient-to-b from-amber-300 to-amber-500 px-8 text-base font-extrabold text-[#2a1f6e] shadow-[0_4px_0_#b45309] transition active:translate-y-1 active:shadow-none">
              Pull to reveal 🎰
            </button>
          </div>
        ) : (
          <div className="relative mt-4 grid grid-cols-3 items-end gap-2 sm:gap-4">
            {[podium[1], podium[0], podium[2]].map((p, i) => p && (
              <div key={p.id + cat} className={cn("rounded-xl border bg-black/25 px-1.5 pb-3 pt-2 text-center sm:px-3",
                rank(p) === 1 ? "border-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.35)]" : "border-white/15", i === 1 ? "pb-5 sm:pb-7" : "")}>
                <div className="mb-1 flex h-7 items-center justify-center">
                  {rank(p) === 1 ? <Crown className="h-7 w-7 animate-bounce text-amber-300" aria-label="First" /> : <span className="text-sm font-bold text-white/70">#{rank(p)}</span>}
                </div>
                <div className={cn("rounded-lg bg-white/95 text-sm text-ink sm:text-base", p.me && "ring-2 ring-amber-300")}>
                  <SlotReel name={p.name} pool={pool} spin={spin} delay={[300, 0, 600][i]}
                    onStop={i === 1 && spin > 0 && (past || p.me) ? () => setFire((f) => f + 1) : undefined} />
                </div>
                <SlotNumber value={val(p)} spin={spin} delay={[300, 0, 600][i]} className="mt-2 text-3xl font-extrabold text-amber-300 sm:text-4xl" />
                <p className="text-[11px] uppercase tracking-wide text-white/60">{UNIT[cat][val(p) === 1 ? 0 : 1]}</p>
                {p.me && <p className="mt-1 text-xs font-semibold text-amber-200">That&apos;s you!</p>}
              </div>
            ))}
          </div>
        )}
        {past && winners.length > 0 && revealed && (
          <p className="relative mt-4 text-center text-sm text-amber-100">
            🏆 {winners.map((w) => w.name).join(" & ")} won with {unit(cat, winners[0].value)}
          </p>
        )}
      </section>

      {/* Where I stand */}
      {me && data?.live && <MyStand me={me} rows={rows} cat={cat} val={val} rank={rank} daysLeft={data.daysLeft} />}

      {/* Everyone */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="font-semibold text-ink">Everyone · {LABEL[cat]}</h2>
          <span className="text-xs text-ink-muted">{rows.length} in the race</span>
        </div>
        {loading && !data ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !rows.length ? (
          <div className="p-4"><EmptyState icon={Trophy} title="No one in the race yet" text="People with daily reports show up here." /></div>
        ) : (
          <ol aria-label={`${LABEL[cat]} ranking`}>
            {rows.map((p) => {
              const r = rank(p), was = prev(p), moved = was == null ? 0 : was - r;
              return (
                <li key={p.id} className={cn("flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-0", p.me && "bg-amber-50")}>
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    r === 1 ? "bg-amber-300 text-[#5b3a00]" : r === 2 ? "bg-slate-200 text-slate-700" : r === 3 ? "bg-orange-200 text-orange-800" : "bg-surface text-ink-muted")}>
                    {val(p) > 0 && r <= 3 ? ["🥇", "🥈", "🥉"][r - 1] : r}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                      <span className="truncate">{p.name}{p.me && " (you)"}</span>
                      {p.titles > 0 && <span title={`${p.titles} monthly ${p.titles === 1 ? "title" : "titles"}`} className="shrink-0 text-xs">🏆{p.titles > 1 ? `×${p.titles}` : ""}</span>}
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                      <div className={cn("h-full rounded-full transition-[width] duration-700", r === 1 ? "bg-amber-400" : "bg-brand")} style={{ width: `${top ? (val(p) / top) * 100 : 0}%` }} />
                    </div>
                  </div>
                  {moved !== 0 && (
                    <span className={cn("inline-flex shrink-0 items-center text-xs font-semibold", moved > 0 ? "text-status-success" : "text-status-danger")}
                      aria-label={moved > 0 ? `Up ${moved} since yesterday` : `Down ${-moved} since yesterday`}>
                      {moved > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}{Math.abs(moved)}
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right text-base font-bold tabular-nums text-ink">{val(p)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      <p className="px-1 text-xs text-ink-muted">Visits = site visits done; closures = tokens, from the daily reports. Champions are announced on the 1st. Ties share the title.</p>
    </div>
  );
}

function MyStand({ me, rows, cat, val, rank, daysLeft }: {
  me: LbPlayer; rows: LbPlayer[]; cat: Cat; val: (p: LbPlayer) => number; rank: (p: LbPlayer) => number; daysLeft: number;
}) {
  const mine = val(me), r = rank(me);
  const ahead = rows.filter((p) => val(p) > mine).sort((a, b) => val(a) - val(b))[0];
  const behind = rows.filter((p) => val(p) < mine).sort((a, b) => val(b) - val(a))[0];
  const gap = ahead ? val(ahead) - mine : 0;
  const lead = behind ? mine - val(behind) : 0;
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Your spot</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-extrabold text-brand">#{r}</span>
        <span className="text-sm text-ink">{unit(cat, mine)}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-ink">
        {!ahead ? (mine > 0 ? `👑 You're leading${behind ? ` by ${unit(cat, lead)}` : ""}. Hold the crown!` : `Get the first ${UNIT[cat][0]} and take #1!`)
          : gap === 1 ? `🔥 Just 1 ${UNIT[cat][0]} to pass ${ahead.name.split(" ")[0]}!`
          : `${unit(cat, gap)} to pass ${ahead.name.split(" ")[0]} for #${rank(ahead)}.`}
      </p>
      {ahead && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-amber-400" style={{ width: `${val(ahead) ? (mine / val(ahead)) * 100 : 0}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        {behind && lead <= 2 ? `⚠️ ${behind.name.split(" ")[0]} is only ${unit(cat, lead)} behind you. ` : ""}
        {daysLeft} {daysLeft === 1 ? "day" : "days"} left to climb.
      </p>
    </Card>
  );
}

/** Blinking marquee bulbs around the machine. */
function Lights() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1.5 flex justify-between">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" style={{ animationDelay: `${(i % 3) * 300}ms` }} />
      ))}
    </div>
  );
}
