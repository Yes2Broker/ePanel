import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ASSIST_ENABLED } from "@/lib/features";
import { Role, runTool, toolsFor } from "@/lib/assist/tools";
import { sanitize, scrubText } from "@/lib/assist/sanitize";
import { systemPrompt } from "@/lib/assist/prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_CALLS = 10;
// Groq models, best first. GROQ_MODEL (if set) is tried first; a model that
// doesn't exist or was retired (404, or 400 naming the model) falls back to the next.
const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
const BUSY = "Y2B Assist isn't available right now. Please try again in a minute.";

interface ChatMsg { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }

/**
 * Y2B Assist. Streams newline-delimited JSON events to the browser:
 * {t:"meta",remaining} · {t:"status",v} · {t:"text",v} · {t:"error",v} · {t:"done"}.
 * Nothing is stored except a count of questions per person per day.
 */
export async function POST(req: NextRequest) {
  if (!ASSIST_ENABLED) return NextResponse.json({ error: "Y2B Assist is switched off." }, { status: 404 });
  const body = await req.json().catch(() => null) as { token?: string; messages?: { role: string; content: string }[] } | null;
  const token = body?.token ?? "";
  const history = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role as "user" | "assistant", content: scrubText(m.content.slice(0, 2000)) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: BUSY }, { status: 503 });

  // Permission ("Y2B Assist" module) + daily limit, checked and counted in the database.
  const use = await supabase.rpc("assist_use", { p_token: token });
  if (use.error) {
    const code = use.error.code;
    if (code === "P0429") return NextResponse.json({ error: "You've used today's 30 questions. Y2B Assist will be back tomorrow." }, { status: 429 });
    if (code === "28000") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json({ error: "Y2B Assist isn't turned on for you. Ask Admin." }, { status: 403 });
  }
  const me = use.data as { name: string; role: Role; today: string; remaining: number };
  const tools = toolsFor(me.role);
  const ctx = { token, today: me.today };
  const messages: ChatMsg[] = [{ role: "system", content: systemPrompt({ name: me.name, role: me.role, today: me.today }) }, ...history];
  const base = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const models = Array.from(new Set([process.env.GROQ_MODEL?.trim(), ...FALLBACK_MODELS].filter(Boolean) as string[]));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ t: "meta", remaining: me.remaining });
      let toolCalls = 0;
      try {
        for (let round = 0; round < MAX_TOOL_CALLS + 2; round++) {
          const res = await groq(base, key, models, {
            messages, stream: true, temperature: 0.2,
            tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
            tool_choice: toolCalls >= MAX_TOOL_CALLS ? "none" : "auto",
          });
          const { text, calls } = await readStream(res, (v) => send({ t: "text", v }));
          if (!calls.length) break;
          messages.push({ role: "assistant", content: text || null, tool_calls: calls });
          for (const c of calls) {
            toolCalls++;
            const result = toolCalls > MAX_TOOL_CALLS
              ? { error: "Too many lookups for one question. Answer with what you have." }
              : (send({ t: "status", v: c.function.name }), await runTool(me.role, ctx, c.function.name, c.function.arguments));
            messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(sanitize(result)).slice(0, 14000) });
          }
        }
        send({ t: "done" });
      } catch (err) {
        if (!(err instanceof GroqError)) console.error(`[assist] ${err instanceof Error ? err.message : "failed"}`);
        send({ t: "error", v: BUSY });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

class GroqError extends Error {}

/** Groq's error details for the Vercel logs: status, code, type, message. Never the key or the chat. */
function logGroqError(status: number, model: string, raw: string) {
  let e: { code?: string; type?: string; message?: string } = {};
  try { e = (JSON.parse(raw) as { error?: typeof e }).error ?? {}; } catch { e = { message: raw.slice(0, 200) }; }
  console.error(`[assist] Groq error ${status} model=${model} code=${e.code ?? "-"} type=${e.type ?? "-"} message=${(e.message ?? "").slice(0, 300)}`);
  return e;
}

const retired = (status: number, e: { code?: string; message?: string }) =>
  status === 404 || (status === 400 && /model|decommission/i.test(`${e.code ?? ""} ${e.message ?? ""}`));

/**
 * One chat completion call. Tries the models in order; once one works, later
 * calls in the same answer start with it.
 */
async function groq(base: string, key: string, models: string[], payload: Record<string, unknown>) {
  while (models.length) {
    const model = models[0];
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload, model,
        // gpt-oss thinks before answering; keep that short so it can't use up the answer.
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", max_completion_tokens: 4096 } : { max_completion_tokens: 1200 }),
      }),
    }).catch((err) => { console.error(`[assist] Groq request failed model=${model}: ${err instanceof Error ? err.message : err}`); throw new GroqError("network"); });
    if (res.ok && res.body) return res.body;
    const e = logGroqError(res.status, model, await res.text().catch(() => ""));
    if (retired(res.status, e) && models.length > 1) { models.shift(); continue; }
    throw new GroqError(`Groq ${res.status}`);
  }
  throw new GroqError("no model");
}

/**
 * Reads one streamed (SSE) chat completion: passes the answer text on as it
 * comes and collects tool calls. Reasoning ("reasoning" fields, from gpt-oss)
 * is never passed on.
 */
async function readStream(body: ReadableStream<Uint8Array>, onText: (v: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "", text = "";
  const calls: ToolCall[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk: { error?: { code?: string; type?: string; message?: string }; choices?: { delta?: { content?: string; reasoning?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) {
        console.error(`[assist] Groq stream error code=${chunk.error.code ?? "-"} type=${chunk.error.type ?? "-"} message=${(chunk.error.message ?? "").slice(0, 300)}`);
        throw new GroqError("stream error");
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) { text += delta.content; onText(delta.content); }
      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.function.name += tc.function.name;
        if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
      }
    }
  }
  return { text, calls: calls.filter(Boolean) };
}
