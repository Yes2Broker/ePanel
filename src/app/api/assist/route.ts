import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ASSIST_ENABLED } from "@/lib/features";
import { Role, runTool, toolsFor } from "@/lib/assist/tools";
import { sanitize, scrubText } from "@/lib/assist/sanitize";
import { systemPrompt } from "@/lib/assist/prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_CALLS = 10;
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
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ t: "meta", remaining: me.remaining });
      let toolCalls = 0;
      try {
        for (let round = 0; round < MAX_TOOL_CALLS + 2; round++) {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model, messages, stream: true, temperature: 0.2, max_tokens: 1200,
              tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
              tool_choice: toolCalls >= MAX_TOOL_CALLS ? "none" : "auto",
            }),
          });
          if (!res.ok || !res.body) throw new Error(`Groq ${res.status}`);
          const { text, calls } = await readStream(res.body, (v) => send({ t: "text", v }));
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
      } catch {
        send({ t: "error", v: BUSY });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Reads one streamed (SSE) chat completion: passes text on as it comes, collects tool calls. */
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
      let chunk: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
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
