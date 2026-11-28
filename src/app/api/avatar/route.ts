import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Profile photos in the PRIVATE Storage bucket "avatars". The browser never
 * gets Storage access: every call sends the panel session token, the database
 * checks it (photo_check / photo_mark / photo_list), and only then this route
 * uses the server-only service key.
 *   POST JSON  { token, action: "urls" }                      → { photos: { [id]: { url, v, hasDefault, hasOwn } } }
 *   POST JSON  { token, action: "remove", employeeId, slot }  → removes default/<id>.webp or own/<id>.webp
 *   POST form  token, employeeId, slot, file (400×400 WebP, ≤ 2 MB) → replaces that photo
 */
const BUCKET = "avatars";
const MAX = 2 * 1024 * 1024;
const URL_TTL = 60 * 60; // signed URLs live 1 hour

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);
}
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const pathOf = (slot: string, id: string) => `${slot}/${id}.webp`;
// WebP normally; PNG / JPEG from browsers that can't encode WebP. Checked by content, not by name.
function imageType(b: Uint8Array) {
  const s = (a: number, z: number) => String.fromCharCode(...b.slice(a, z));
  if (b.length > 12 && s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
  if (b.length > 8 && b[0] === 0x89 && s(1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export async function POST(req: NextRequest) {
  const store = storage();
  if (!store) {
    console.error("avatar: SUPABASE_SERVICE_ROLE_KEY is not set");
    return fail("Photos aren't set up yet. Ask Admin.", 503);
  }
  const form = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

  if (!form) {
    const body = await req.json().catch(() => null) as { token?: string; action?: string; employeeId?: string; slot?: string } | null;
    const token = body?.token ?? "";
    if (body?.action === "urls") {
      const { data, error } = await supabase.rpc("photo_list", { p_token: token });
      if (error) return fail(error.message, 401);
      const list = (data ?? []) as { id: string; slot: string; v: number; hasDefault: boolean; hasOwn: boolean }[];
      if (!list.length) return NextResponse.json({ photos: {} });
      const { data: signed, error: e2 } = await store.createSignedUrls(list.map((p) => pathOf(p.slot, p.id)), URL_TTL);
      if (e2) { console.error("avatar sign:", e2.message); return fail("Couldn't load photos.", 502); }
      const photos: Record<string, { url: string | null; v: number; hasDefault: boolean; hasOwn: boolean }> = {};
      list.forEach((p, i) => { photos[p.id] = { url: signed?.[i]?.signedUrl ?? null, v: p.v, hasDefault: p.hasDefault, hasOwn: p.hasOwn }; });
      return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "remove") {
      const id = body.employeeId ?? "", slot = body.slot ?? "";
      const ok = await supabase.rpc("photo_check", { p_token: token, p_emp: id, p_slot: slot, p_remove: true });
      if (ok.error) return fail(ok.error.message, 403);
      const { error } = await store.remove([pathOf(slot, id)]);
      if (error) { console.error("avatar remove:", error.message); return fail("Couldn't remove the photo.", 502); }
      const mark = await supabase.rpc("photo_mark", { p_token: token, p_emp: id, p_slot: slot, p_on: false });
      if (mark.error) return fail(mark.error.message, 403);
      return NextResponse.json({ ok: true });
    }
    return fail("Unknown request.");
  }

  const data = await req.formData();
  const token = String(data.get("token") ?? ""), id = String(data.get("employeeId") ?? ""), slot = String(data.get("slot") ?? "");
  const file = data.get("file");
  if (!(file instanceof Blob)) return fail("Choose a photo.");
  if (file.size > MAX) return fail("The photo must be 2 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return fail("Only image files can be uploaded.");
  const ok = await supabase.rpc("photo_check", { p_token: token, p_emp: id, p_slot: slot, p_remove: false });
  if (ok.error) return fail(ok.error.message, 403);
  // Only the newest photo is kept: remove the old file, then store the new one.
  await store.remove([pathOf(slot, id)]);
  const { error } = await store.upload(pathOf(slot, id), Buffer.from(bytes), { contentType: type, upsert: true, cacheControl: "60" });
  if (error) { console.error("avatar upload:", error.message); return fail("Couldn't save the photo.", 502); }
  const mark = await supabase.rpc("photo_mark", { p_token: token, p_emp: id, p_slot: slot, p_on: true });
  if (mark.error) return fail(mark.error.message, 403);
  return NextResponse.json({ ok: true });
}
