import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { EmailPayload, sendReportEmails } from "@/lib/report-email";
import { sendPendingPushes } from "@/lib/push-server";

export const dynamic = "force-dynamic";

// Called every 30 minutes by Supabase's scheduler (supabase/email_schedule.sql)
// with "Authorization: Bearer <CRON_SECRET>". The same secret unlocks the
// report data in the database, so the public anon key alone can't read it.
// The database returns nothing outside the chosen send time or once today's
// email has gone, so most calls send no email. Every call also sends any
// notifications still waiting to be pushed.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("report_email_payload", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let email: unknown = { sent: 0, skipped: "not the send time, or already sent today" };
  let failed = false;
  if (data) {
    try {
      email = { sent: await sendReportEmails(data as EmailPayload) };
    } catch (err) {
      failed = true;
      email = { error: err instanceof Error ? err.message : "Send failed" };
      // Tell the Admins (bell + push, sent just below).
      await supabase.rpc("report_email_failed", { p_secret: secret, p_message: (email as { error: string }).error });
    }
  }
  // Also the backup sender for notifications, and the daily report reminders.
  let push: unknown;
  try {
    push = await sendPendingPushes(true);
  } catch (err) {
    push = { error: err instanceof Error ? err.message : "Push failed" };
  }
  return NextResponse.json({ email, push }, { status: failed ? 500 : 200 });
}

export const GET = handle;
export const POST = handle;
