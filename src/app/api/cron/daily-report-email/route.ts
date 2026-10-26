import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { EmailPayload, sendReportEmails } from "@/lib/report-email";

export const dynamic = "force-dynamic";

// Called every 30 minutes by Supabase's scheduler (supabase/email_schedule.sql)
// with "Authorization: Bearer <CRON_SECRET>". The same secret unlocks the
// report data in the database, so the public anon key alone can't read it.
// The database returns nothing outside the chosen send time or once today's
// email has gone, so most calls send nothing.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("report_email_payload", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ sent: 0, skipped: "not the send time, or already sent today" });
  try {
    const sent = await sendReportEmails(data as EmailPayload);
    return NextResponse.json({ sent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
