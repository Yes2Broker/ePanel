import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Doesn't throw, so the app still builds and renders — but every call
  // will fail with a clear message until .env.local is filled in.
  console.warn("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

// We don't use Supabase Auth (see supabase/functions.sql), so don't let the
// client try to persist or refresh an auth session of its own.
export const supabase = createClient(supabaseUrl || "http://localhost:54321", supabaseAnonKey || "missing-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false },
});
