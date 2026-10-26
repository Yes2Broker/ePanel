"use client";

import { useEffect, useState } from "react";
import { Bell, Clock, Mail, MapPin, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton, Toggle } from "@/components/ui/button";
import { ErrorBanner, Loading } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { TimeSelect, timeLabel } from "@/components/ui/pickers";
import { api, errorMessage, getSessionToken } from "@/lib/api";
import { useApi } from "@/lib/use-api";

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
      toast(`The daily email will go out at ${timeLabel(t)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingTime(false);
    }
  };
  const reminders = useApi(() => api.getReportReminders());
  const saveReminders = async (on: boolean) => {
    try {
      reminders.setData(await api.setReportReminders(on));
      toast(on ? "Reminders are on." : "Reminders are off.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  const remindAt = useApi(() => api.getReportReminderTime());
  const [savingRemindAt, setSavingRemindAt] = useState(false);
  const saveRemindAt = async (t: string) => {
    setSavingRemindAt(true);
    try {
      remindAt.setData(await api.setReportReminderTime(t));
      toast(`The reminder will go out at ${timeLabel(t)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSavingRemindAt(false);
    }
  };
  const reminderAt = remindAt.data ?? "19:00";
  const visits = useApi(() => api.getVisitReminder());
  const saveVisits = async (on: boolean | null, t: string | null) => {
    try {
      const next = await api.setVisitReminder(on, t);
      visits.setData(next);
      toast(t ? `The visit reminder will go out at ${timeLabel(t)}.` : next.on ? "Visit reminders are on." : "Visit reminders are off.");
    } catch (err) {
      toast(errorMessage(err), "error");
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
          <TimeSelect ariaLabel="Send at (India time)" value={time.data ?? "22:00"} disabled={savingTime || !time.data} onChange={saveTime} />
          <span className="text-sm text-ink-faint">India time, every day</span>
        </div>
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">Daily report reminder</h3></div>
            <p className="mt-1 text-sm text-ink-faint">
              A notification at {timeLabel(reminderAt)} to anyone who hasn&apos;t filed their report yet (not on leave or weekly off).
            </p>
          </div>
          <Toggle checked={reminders.data ?? true} disabled={reminders.data == null} onChange={saveReminders} label="Daily report reminder" />
        </div>
        <ErrorBanner message={remindAt.error} onRetry={remindAt.reload} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">Remind at</span>
          <TimeSelect ariaLabel="Remind at (India time)" value={reminderAt} disabled={savingRemindAt || !remindAt.data} onChange={saveRemindAt} />
          <span className="text-sm text-ink-faint">India time</span>
        </div>
        {remindAt.data && time.data && remindAt.data >= time.data && (
          <p className="rounded-xl bg-status-warningBg px-3 py-2 text-sm text-status-warning">The reminder goes out after the email. Pick an earlier time.</p>
        )}
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">Morning visit reminder</h3></div>
            <p className="mt-1 text-sm text-ink-faint">
              At {timeLabel(visits.data?.time ?? "10:00")}, everyone with site visits today gets a list of them (not on leave or weekly off).
            </p>
          </div>
          <Toggle checked={visits.data?.on ?? true} disabled={!visits.data} onChange={(v) => saveVisits(v, null)} label="Morning visit reminder" />
        </div>
        <ErrorBanner message={visits.error} onRetry={visits.reload} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">Remind at</span>
          <TimeSelect ariaLabel="Visit reminder at (India time)" value={visits.data?.time ?? "10:00"} disabled={!visits.data} onChange={(t) => saveVisits(null, t)} />
          <span className="text-sm text-ink-faint">India time</span>
        </div>
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">Recipients</h3></div>
        <p className="text-sm text-ink-faint">Every day at {timeLabel(time.data ?? "22:00")} (India time) one email goes out for the Normal report and one for each active sole selling project, with Daily, WTD and MTD tables.</p>
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
