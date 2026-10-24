import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { EmailPayload, sendReportEmails } from "@/lib/report-email";

export const dynamic = "force-dynamic";

// Admin's "Send test email now" button. The database checks the session
// token belongs to an Admin before returning any data.
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({ token: null }));
  const { data, error } = await supabase.rpc("report_email_payload_admin", { p_token: token ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  try {
    const sent = await sendReportEmails(data as EmailPayload);
    return NextResponse.json({ sent });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}
