import webpush from "web-push";
import { supabase } from "@/lib/supabase";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";

/**
 * Sends the notifications that haven't been pushed yet (supabase/notifications.sql).
 * The database hands each one out only once (push_claim), so a notification is
 * never pushed twice, whether this runs right after an action or from the cron.
 * Devices the push service says are gone (404 / 410) are removed.
 */
interface Claim {
  batch: string;
  items: { id: number; title: string; body: string; link: string | null; subs: { endpoint: string; p256dh: string; auth: string }[] }[];
}

export async function sendPendingPushes(cron: boolean) {
  const secret = process.env.CRON_SECRET;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret) return { sent: 0, skipped: "CRON_SECRET is not set" };
  // Without the key nothing can be pushed: leave the immediate ones for later,
  // but the cron still runs (it makes the daily reminders for the bell).
  if (!privateKey && !cron) return { sent: 0, skipped: "VAPID_PRIVATE_KEY is not set" };
  const { data, error } = await supabase.rpc("push_claim", { p_secret: secret, p_cron: cron });
  if (error) throw new Error(error.message);
  const claim = data as Claim;
  if (!privateKey) return { sent: 0, skipped: "VAPID_PRIVATE_KEY is not set" };

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://epanel.yes2broker.in", VAPID_PUBLIC_KEY, privateKey);
  const gone = new Set<string>();
  let sent = 0;
  await Promise.all(claim.items.flatMap((n) => n.subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ id: n.id, title: n.title, body: n.body, link: n.link ?? "/" }),
        { TTL: 24 * 60 * 60 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.add(s.endpoint);
    }
  })));
  const done = await supabase.rpc("push_done", { p_secret: secret, p_batch: claim.batch, p_gone: Array.from(gone) });
  if (done.error) throw new Error(done.error.message);
  return { sent, removed: gone.size };
}
