import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPendingPushes } from "@/lib/push-server";

export const dynamic = "force-dynamic";

// Called by the app right after an action that may notify someone (leave,
// attendance, reports), so the push goes out at once. Only for signed-in people.
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({ token: null }));
  const { error } = await supabase.rpc("push_check", { p_token: token ?? null });
  if (error) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json(await sendPendingPushes(false));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
  }
}
