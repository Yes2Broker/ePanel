"use client";

import { useEffect, useState } from "react";
import { Clock, Mail, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { ErrorBanner, Loading, selectCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage, getSessionToken } from "@/lib/api";
import { useApi } from "@/lib/use-api";

// Every half hour of the day, "00:00" … "23:30".
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const slotLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** Admin: who receives the daily report emails and when, plus a test-send button. */
export function EmailSettings() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.getReportEmailRecipients());
  const time = useApi(() => api.getReportEmailTime());
  const [savingTime, setSavingTime] = useState(false);
  const saveTime = async (t: string) => {
    setSavingTime(true);
    try {
      time.setData(await api.setReportEmailTime(t));
      toast(`The daily email will go out at ${slotLabel(t)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingTime(false);
    }
  };
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { if (data) setText(data.join("\n")); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.setReportEmailRecipients(text.split(/[\s,;]+/).filter(Boolean));
      setText(saved.join("\n"));
      toast("Recipients saved.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/report-email/test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: getSessionToken() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Send failed");
      toast(`Sent ${body.sent.length} email${body.sent.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">Send at</h3></div>
        <ErrorBanner message={time.error} onRetry={time.reload} />
        <div className="flex flex-wrap items-center gap-2">
          <select value={time.data ?? "22:00"} disabled={savingTime || !time.data} onChange={(e) => saveTime(e.target.value)} aria-label="Send at (India time)" className={selectCls}>
            {SLOTS.map((t) => <option key={t} value={t}>{slotLabel(t)}</option>)}
          </select>
          <span className="text-sm text-ink-faint">India time, every day</span>
        </div>
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">Recipients</h3></div>
        <p className="text-sm text-ink-faint">Every day at {slotLabel(time.data ?? "22:00")} (India time) one email goes out for the Normal report and one for each active sole selling project, with Daily, WTD and MTD tables.</p>
        <ErrorBanner message={error} onRetry={reload} />
        {loading && !data ? <Loading /> : (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Recipient email addresses, one per line"
              className="w-full rounded-xl border border-surface-border px-3.5 py-2.5 font-mono text-sm focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand" />
            <p className="text-xs text-ink-faint">One address per line.</p>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save recipients"}</PrimaryButton>
              <SecondaryButton onClick={test} disabled={sending}><Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send test email now"}</SecondaryButton>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
