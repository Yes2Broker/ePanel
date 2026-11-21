"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const EASE = "cubic-bezier(0.12, 0.8, 0.22, 1.04)";
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A number that rolls into place like a slot machine counter. `spin` changes → roll again. */
export function SlotNumber({ value, spin = 0, delay = 0, className }: { value: number; spin?: number; delay?: number; className?: string }) {
  const digits = String(Math.max(0, value)).split("").map(Number);
  const [go, setGo] = useState(false);
  useEffect(() => {
    setGo(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    return () => cancelAnimationFrame(id);
  }, [value, spin]);
  const still = reduced();
  return (
    <span className={cn("inline-flex overflow-hidden tabular-nums leading-none", className)} aria-label={String(value)} role="img">
      {digits.map((d, i) => (
        <span key={i} className="relative inline-block h-[1em] overflow-hidden" aria-hidden>
          <span className="flex flex-col"
            style={{
              transform: `translateY(-${(go || still ? 20 + d : d) * 10 / 3}%)`,
              transition: go && !still ? `transform ${1100 + i * 180}ms ${EASE} ${delay}ms` : "none",
            }}>
            {Array.from({ length: 30 }, (_, k) => <span key={k} className="block h-[1em]">{k % 10}</span>)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** A reel of names spinning down and stopping on `name`. `spin` changes → spin again. */
export function SlotReel({ name, pool, spin, delay = 0, className, onStop }: {
  name: string; pool: string[]; spin: number; delay?: number; className?: string; onStop?: () => void;
}) {
  const ROW = 44;
  // A shuffled strip of other names, ending on the result.
  const strip = useMemo(() => {
    const others = pool.length ? pool : [name];
    return [...Array.from({ length: 18 }, (_, i) => others[(i * 7 + spin * 3) % others.length]), name];
  }, [name, pool, spin]);
  const [go, setGo] = useState(false);
  const still = reduced();
  const ms = 1600 + delay;
  useEffect(() => {
    setGo(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const done = setTimeout(() => onStop?.(), still ? 0 : ms + 50);
    return () => { cancelAnimationFrame(id); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin, name]);
  const end = (strip.length - 1) * ROW;
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ height: ROW }}>
      <div aria-hidden style={{
        transform: `translateY(-${go || still ? end : 0}px)`,
        transition: go && !still ? `transform ${ms}ms ${EASE}` : "none",
        filter: go || still ? undefined : "blur(1px)",
      }}>
        {strip.map((n, i) => <div key={i} className="flex items-center justify-center truncate px-2 text-center font-semibold" style={{ height: ROW }}>{n}</div>)}
      </div>
      <span className="sr-only">{name}</span>
    </div>
  );
}
