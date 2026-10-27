"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, SendHorizontal, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
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
 * Y2B Assist: floating button + chat (side panel on desktop, full-height
 * sheet on phones). The chat lives only in this browser tab (sessionStorage)
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
    end.current?.scrollIntoView({ block: "end" });
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

  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(msgs[i].content); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };
  const closeOnPhone = () => { if (window.matchMedia("(max-width: 639px)").matches) onClose(); };
  const last = msgs[msgs.length - 1];

  return (
    <Modal open={open} onClose={onClose} panel title="Y2B Assist"
      subtitle={
        <span className="flex items-center gap-2">
          <button onClick={() => { setMsgs([]); setRemaining(null); }} disabled={busy} className="font-medium text-brand hover:underline disabled:opacity-50">New chat</button>
          {remaining != null && remaining <= 5 && <span>· {remaining} question{remaining === 1 ? "" : "s"} left today</span>}
        </span>
      }
      bodyClassName="max-sm:min-h-[calc(100dvh-13rem)]"
      footer={
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="space-y-1.5">
          <div className="flex items-end gap-2">
            <textarea ref={field} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={1000} aria-label="Ask Y2B Assist"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder="Ask a question…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand sm:text-sm" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white disabled:opacity-40"><SendHorizontal className="h-4 w-4" /></button>
          </div>
          <p className="text-[11px] text-ink-faint">AI can make mistakes. Check important numbers.</p>
        </form>
      }>
      {msgs.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft"><Sparkles className="h-4 w-4 text-brand" /></span>
            <p className="pt-1 text-sm text-ink">Hi {user?.name.split(" ")[0]}! I can look up your {manager ? "team's reports, attendance and leave" : "visits, reports, attendance and leave"}, and explain how the panel works.</p>
          </div>
          <div className="grid gap-2" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} className="min-h-11 rounded-xl border border-surface-border bg-white px-3.5 py-2 text-left text-sm text-ink hover:bg-surface">{s}</button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Conversation">
          {msgs.map((m, i) => (
            <li key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white">{m.content}</div>
              ) : (
                <div className="group max-w-[92%]" data-testid="assist-answer">
                  <div className={cn("break-words rounded-2xl rounded-bl-md px-3.5 py-2 text-sm", m.error ? "bg-status-warningBg text-status-warning" : "bg-surface text-ink")}>
                    {m.content ? <Markdown text={m.content} onLink={closeOnPhone} />
                      : <p className="animate-pulse text-ink-muted">{(busy && i === msgs.length - 1 && status) || "Thinking…"}</p>}
                  </div>
                  {m.content && !m.error && !(busy && m === last) && (
                    <button onClick={() => copy(i)} aria-label="Copy answer" className="mt-0.5 flex h-8 items-center gap-1 rounded-lg px-1.5 text-[11px] text-ink-faint hover:text-ink">
                      {copied === i ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <div ref={end} />
    </Modal>
  );
}
