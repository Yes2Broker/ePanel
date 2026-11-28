"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** The dark, small, rounded panel tooltip, placed above (or below) the anchor, always on screen. */
function Bubble({ anchor, text, id }: { anchor: HTMLElement; text: React.ReactNode; id: string }) {
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const a = anchor.getBoundingClientRect(), b = ref.current?.getBoundingClientRect();
    const w = b?.width ?? 200, h = b?.height ?? 40;
    const below = a.top - h - 8 < 4;
    setPos({ left: Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8), top: below ? a.bottom + 8 : a.top - h - 8, below });
  }, [anchor, text]);
  return createPortal(
    <div ref={ref} id={id} role="tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className="pointer-events-none fixed z-[70] max-w-[16rem] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-lg">
      {text}
    </div>,
    document.body,
  );
}

/**
 * Help text for a button or chip: hover on desktop; press and hold (~0.5 s) on
 * phones. A long-press only shows the text — it never triggers the button.
 */
export function HelpTip({ text, children, className }: { text: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<number>();
  const longPressed = useRef(false);
  const hover = useRef<number>();
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(hover.current); }, []);
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    // Any other tap / click (or scrolling) closes it, so only one help shows at a time.
    const tapElsewhere = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setShow(false); };
    window.addEventListener("scroll", hide, true);
    document.addEventListener("pointerdown", tapElsewhere, true);
    document.addEventListener("touchstart", tapElsewhere, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("pointerdown", tapElsewhere, true);
      document.removeEventListener("touchstart", tapElsewhere, true);
    };
  }, [show]);
  return (
    <span ref={ref} aria-describedby={show ? id : undefined} className={cn("inline-flex", className)}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") hover.current = window.setTimeout(() => setShow(true), 250); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") { window.clearTimeout(hover.current); setShow(false); } }}
      onTouchStart={() => { longPressed.current = false; timer.current = window.setTimeout(() => { longPressed.current = true; setShow(true); }, 500); }}
      onTouchMove={() => window.clearTimeout(timer.current)}
      onTouchEnd={(e) => {
        window.clearTimeout(timer.current);
        if (longPressed.current) { e.preventDefault(); window.setTimeout(() => setShow(false), 2500); }
      }}
      onClickCapture={(e) => { if (longPressed.current) { e.preventDefault(); e.stopPropagation(); longPressed.current = false; } }}
      onContextMenu={(e) => { if (longPressed.current) e.preventDefault(); }}>
      {children}
      {show && ref.current && <Bubble anchor={ref.current} text={text} id={id} />}
    </span>
  );
}

/** A small (i) button that shows the help on tap (and on hover). */
export function InfoTip({ text, label }: { text: React.ReactNode; label: string }) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setShow(false); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", () => setShow(false), { capture: true, once: true });
    return () => document.removeEventListener("pointerdown", close);
  }, [show]);
  return (
    <button ref={ref} type="button" aria-label={label} aria-expanded={show} aria-describedby={show ? id : undefined}
      onClick={() => setShow((s) => !s)} onPointerEnter={(e) => e.pointerType === "mouse" && setShow(true)} onPointerLeave={(e) => e.pointerType === "mouse" && setShow(false)}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface hover:text-ink">
      <Info className="h-4 w-4" aria-hidden />
      {show && ref.current && <Bubble anchor={ref.current} text={text} id={id} />}
    </button>
  );
}
