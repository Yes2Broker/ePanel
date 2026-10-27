"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarCheck, CalendarOff, Check, Copy, FileText, MapPin, Sparkles, SquarePen, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/context/session-context";
import { areasOf } from "@/lib/assist/access";
import { getSessionToken } from "@/lib/api";
import { ASSIST_ENABLED } from "@/lib/features";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/assist/markdown";

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

const STATUS: Record<string, string> = {
  my_visits: "Checking your visits…", reports: "Looking at the reports…", attendance: "Looking at the attendance…",
  my_leave: "Looking at your leave…", today_report_status: "Checking today's report…", team_summary: "Adding up the team's reports…",
  not_filed_today: "Checking who has filed…", attendance_checks: "Checking attendance checks…", pending_leave: "Looking at leave requests…",
  __retry: "Busy, retrying…",
};

/**
 * Y2B Assist: floating button + chat (420px side panel on desktop, full
 * screen on phones). The chat lives only in this browser tab (sessionStorage)
 * until the tab closes or "New chat"; nothing is saved on the server.
 */
export function Assist() {
  const { user, permissions } = useSession();
  const [open, setOpen] = useState(false);
  if (!ASSIST_ENABLED || !user || !permissions?.assist) return null;
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Open Y2B Assist"
          className="fixed bottom-[calc(var(--nav-h)+1rem)] right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-ink py-2.5 pl-3.5 pr-4 text-sm font-medium text-white shadow-lg hover:bg-ink/90 md:bottom-6 md:right-6">
          <Sparkles className="h-4 w-4" /> Y2B Assist
        </button>
      )}
      <AssistChat key={user.id} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AssistChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, permissions } = useSession();
  const manager = user?.role === "HR" || user?.role === "Admin";
  const can = areasOf(user?.role ?? "", permissions ?? {});
  const storeKey = `y2b-assist-${user?.id}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { setMsgs(JSON.parse(window.sessionStorage.getItem(storeKey) ?? "[]")); } catch { /* fresh chat */ }
  }, [storeKey]);
  useEffect(() => {
    try { window.sessionStorage.setItem(storeKey, JSON.stringify(msgs)); } catch { /* tab-only anyway */ }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs, storeKey, status]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 50); }, [open]);

  // Built from the same permissions the server uses: only what this person has.
  const suggestions = (manager
    ? [can.reports && "Who hasn't filed today's report?", can.reports && "Team summary today", can.leave && "Pending leave requests", can.attendance && "Who hasn't checked attendance?",
       !can.reports && can.attendance && "My attendance this month", !can.reports && can.leave && "How do I apply for leave?"]
    : [can.reports && "My visits today", can.reports && "How many reports this month?", can.attendance && "My attendance this month", can.leave && "How do I apply for leave?"]
  ).filter((s): s is string => !!s).slice(0, 4);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("");
    const update = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      const res = await fetch("/api/assist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getSessionToken(), messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 429) setRemaining(0);
        const e = await res.json().catch(() => ({}));
        update(() => ({ role: "assistant", content: e.error || "Y2B Assist isn't available right now. Please try again in a minute.", error: true }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { t: string; v?: string; remaining?: number };
          if (e.t === "meta") setRemaining(e.remaining ?? null);
          else if (e.t === "status") setStatus(STATUS[e.v ?? ""] ?? "Looking it up…");
          else if (e.t === "text") { setStatus(""); update((m) => ({ ...m, content: m.content + (e.v ?? "") })); }
          else if (e.t === "error") update((m) => ({ role: "assistant", content: m.content ? `${m.content}\n\n${e.v}` : e.v ?? "", error: !m.content }));
        }
      }
    } catch {
      update(() => ({ role: "assistant", content: "Y2B Assist isn't available right now. Please try again in a minute.", error: true }));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [busy, msgs]);

  const toast = useToast();
  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(msgs[i].content); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };
  const closeOnPhone = () => { if (window.matchMedia("(max-width: 639px)").matches) onClose(); };
  const newChat = () => setMsgs([]);

  // Auto-growing input, up to 5 lines.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 5 * 24 + 20)}px`;
  }, [input]);
  // Escape closes; the page behind doesn't scroll while the phone sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const phone = window.matchMedia("(max-width: 639px)").matches, prev = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const first = user?.name.split(" ")[0];
  const iconFor = (q: string) => /visit/i.test(q) ? MapPin : /report|filed|summary/i.test(q) ? FileText : /leave/i.test(q) ? CalendarOff : CalendarCheck;

  return (
    <div role="dialog" aria-modal="true" aria-label="Y2B Assist" aria-hidden={!open}
      className={cn("fixed inset-0 z-50 sm:pointer-events-none", !open && "pointer-events-none invisible")}>
      <div onClick={onClose} className={cn("absolute inset-0 bg-ink/20 transition-opacity duration-200 sm:hidden", open ? "opacity-100" : "opacity-0")} />
      <div className={cn(
        "pointer-events-auto absolute inset-0 flex flex-col bg-white transition-all duration-300 ease-out sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] sm:shadow-2xl",
        open ? "translate-y-0 opacity-100 sm:translate-x-0" : "translate-y-6 opacity-0 sm:translate-x-8 sm:translate-y-0")}>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Avatar />
          <h2 className="text-[15px] font-semibold text-ink">Y2B Assist</h2>
          <span className="flex-1" />
          <button onClick={newChat} disabled={busy} aria-label="New chat" title="New chat"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"><SquarePen className="h-[18px] w-[18px]" /></button>
          <button onClick={onClose} aria-label="Close" title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4">
          {msgs.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-dark shadow-md"><Sparkles className="h-7 w-7 text-white" /></span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Hi {first}, how can I help?</h3>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5" aria-label="Suggested questions">
                {suggestions.map((q) => {
                  const Icon = iconFor(q);
                  return (
                    <button key={q} onClick={() => ask(q)}
                      className="flex min-h-[5.5rem] flex-col items-start gap-2 rounded-2xl border border-surface-border bg-white p-3 text-left text-[13px] leading-snug text-ink transition hover:border-brand/40 hover:bg-surface">
                      <Icon className="h-4 w-4 text-brand" /> <span>{q}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <ol className="space-y-6 py-4" aria-label="Conversation">
              {msgs.map((m, i) => {
                const streaming = busy && i === msgs.length - 1;
                return (
                  <li key={i}>
                    {m.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-white sm:text-sm">{m.content}</div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <Avatar small />
                        <div className="min-w-0 flex-1 pt-0.5" data-testid="assist-answer">
                          {m.content ? (
                            <div className={cn("break-words text-[15px] leading-7 sm:text-sm sm:leading-6", m.error ? "text-status-warning" : "text-ink")}>
                              <Markdown text={m.content} onLink={closeOnPhone} />
                              {streaming && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-sm bg-ink align-baseline" aria-hidden />}
                            </div>
                          ) : (
                            <div className="flex h-7 items-center gap-2 text-sm text-ink-muted" aria-label="Thinking">
                              <span className="flex gap-1">
                                {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint" style={{ animationDelay: `${d}ms` }} />)}
                              </span>
                              {streaming && status && <span>{status}</span>}
                            </div>
                          )}
                          {m.content && !m.error && !streaming && (
                            <div className="mt-1.5 flex gap-0.5 text-ink-faint">
                              <IconButton label="Copy answer" onClick={() => copy(i)}>{copied === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</IconButton>
                              <IconButton label="Good answer" onClick={() => toast("Thanks for the feedback.")}><ThumbsUp className="h-4 w-4" /></IconButton>
                              <IconButton label="Bad answer" onClick={() => toast("Thanks for the feedback.")}><ThumbsDown className="h-4 w-4" /></IconButton>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={end} />
        </div>

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {/* Questions left today (employees only; HR/Admin get no count). */}
          {remaining != null && (
            <p className={cn("mb-1.5 px-3 text-xs", remaining <= 3 ? "font-medium text-status-warning" : "text-ink-faint")}>
              {remaining === 0 ? "You've used today's 30 questions. Back tomorrow." : `${remaining} question${remaining === 1 ? "" : "s"} left today`}
            </p>
          )}
          <div className="flex items-end gap-2 rounded-[1.75rem] border border-surface-border bg-white py-1.5 pl-4 pr-1.5 shadow-[0_4px_20px_rgba(15,23,42,0.08)] focus-within:border-brand/50">
            <textarea ref={field} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={1000} aria-label="Ask Y2B Assist" disabled={remaining === 0}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder={remaining === 0 ? "Back tomorrow" : "Ask anything…"}
              className="max-h-[140px] flex-1 resize-none bg-transparent py-2 text-base leading-6 text-ink placeholder:text-ink-faint focus:outline-none sm:text-sm" />
            <button type="submit" disabled={busy || !input.trim() || remaining === 0} aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition disabled:bg-surface-border disabled:text-ink-faint"><ArrowUp className="h-5 w-5" /></button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-ink-faint">AI can make mistakes. Check important numbers.</p>
        </form>
      </div>
    </div>
  );
}

function Avatar({ small }: { small?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark", small ? "h-7 w-7" : "h-8 w-8")}>
      <Sparkles className={cn("text-white", small ? "h-3.5 w-3.5" : "h-4 w-4")} />
    </span>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface hover:text-ink">{children}</button>;
}
