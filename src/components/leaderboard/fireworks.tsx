"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#FFC233", "#FF5E7E", "#3DD68C", "#5B8CFF", "#B57BFF", "#FFFFFF"];

/**
 * Full-screen fireworks + confetti for a few seconds. Doesn't block clicks.
 * Skipped for people who turned on "reduce motion". Change `run` to fire again.
 */
export function Fireworks({ run, duration = 4500, colors = COLORS, bursts = true }: { run: number; duration?: number; colors?: string[]; bursts?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!run || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    window.addEventListener("resize", size);
    type P = { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number; spark: boolean; rot: number };
    const parts: P[] = [];
    const burst = () => {
      const x = innerWidth * (0.15 + Math.random() * 0.7), y = innerHeight * (0.12 + Math.random() * 0.35);
      const c = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 60; i++) {
        const a = (Math.PI * 2 * i) / 60, s = 2 + Math.random() * 3.5;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c, r: 2, spark: true, rot: 0 });
      }
    };
    const confetti = () => {
      for (let i = 0; i < 6; i++) parts.push({
        x: Math.random() * innerWidth, y: -10, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2,
        life: 1, c: colors[Math.floor(Math.random() * colors.length)], r: 4 + Math.random() * 4, spark: false, rot: Math.random() * 6,
      });
    };
    const start = performance.now();
    let last = 0, raf = 0;
    const tick = (t: number) => {
      const busy = t - start < duration;
      if (bursts && busy && t - last > 380) { burst(); last = t; }
      if (busy) confetti();
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.spark) { p.vy += 0.05; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.013; } else { p.vy += 0.02; p.rot += 0.1; if (p.y > innerHeight + 20) p.life = 0; }
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.c;
        if (p.spark) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      if (busy || parts.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); ctx.clearRect(0, 0, innerWidth, innerHeight); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, duration]);
  return <canvas ref={ref} aria-hidden data-fireworks={run || undefined} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" />;
}
