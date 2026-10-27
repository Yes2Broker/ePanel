import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ASSIST_ENABLED } from "@/lib/features";
import { Role, runTool, toolsFor } from "@/lib/assist/tools";
import { sanitize, scrubText } from "@/lib/assist/sanitize";
import { systemPrompt } from "@/lib/assist/prompt";
import { resolvePeriod } from "@/lib/assist/period";
import { createGuard } from "@/lib/assist/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOOL_CALLS = 10;
// Groq models, best first; each has its own rate limit. GROQ_MODEL (if set) is
// tried first. A model that's retired (404 / 400 naming it) or rate limited for
// longer than MAX_WAIT_S falls back to the next.
const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const MAX_WAIT_S = 10;
// Groq's free plan counts tokens: keep each request small.
const HISTORY = 6;          // chat messages sent per request
const TOOL_RESULT_CHARS = 1400;
const INPUT_BUDGET = 1150;  // estimated input tokens per request (≈ 3.5 characters each)

// Hellos and one-word / rude messages get a fixed calm line (no AI call).
const GREETING = /^(hi+|hello+|hey+|hiya|namaste|namaskar|kem cho|good (morning|afternoon|evening))( there| y2b| assist)?$/;
const CASUAL = /^(yo+|sup|wassup|ok+|okay|k+|hmm+|lol|shit|damn|wtf|fuck( (you|off|this))?|bc|mc|thanks?|thank you|thx|ty|cool|nice|fine|acha+|accha+|theek hai|ok thanks?)$/;
const ASK = "What do you need: attendance, reports, visits or leave?";
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
  const chat = (body?.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30);
  const history = chat.slice(-HISTORY)
    .map((m) => ({ role: m.role as "user" | "assistant", content: scrubText(m.content.slice(0, m.role === "user" ? 300 : 400)) }));
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
  const question = history[history.length - 1].content;
  const plain = question.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  if (GREETING.test(plain) || CASUAL.test(plain)) {
    const reply = GREETING.test(plain) ? `Hi ${me.name.split(" ")[0]}. ${ASK}` : ASK;
    const lines = [{ t: "meta", remaining: me.remaining }, { t: "text", v: reply }, { t: "done" }];
    return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const tools = toolsFor(me.role);
  // The period is worked out here, from the whole chat, never by the model.
  const period = resolvePeriod(chat.filter((m) => m.role === "user").map((m) => m.content), me.today);
  const ctx = { token, today: me.today, period };
  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt({ name: me.name, role: me.role, today: me.today }) },
    ...(period ? [{ role: "system" as const, content: `Period asked: ${period.label}.` }] : []),
    ...history,
  ];
  const fullList = /\b(full|all|complete|entire|whole|poori|pura|sab|saare|sabhi|list)\b/i.test(question);
  const base = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const models = Array.from(new Set([process.env.GROQ_MODEL?.trim(), ...FALLBACK_MODELS].filter(Boolean) as string[]));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ t: "meta", remaining: me.remaining });
      let toolCalls = 0;
      const used = { requests: 0, input: 0, output: 0 };
      const guard = createGuard((v) => send({ t: "text", v }), fullList ? 250 : 85);
      const toolsJson = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      try {
        for (let round = 0; round < MAX_TOOL_CALLS + 2; round++) {
          const estimate = fitBudget(messages, JSON.stringify(toolsJson));
          const { body: res, model } = await groq(base, key, models, {
            messages, stream: true, temperature: 0.2, stream_options: { include_usage: true },
            tools: toolsJson, tool_choice: toolCalls >= MAX_TOOL_CALLS ? "none" : "auto",
          }, () => send({ t: "status", v: "__retry" }), estimate > 1000 ? "low" : "medium");
          const { text, calls, usage } = await readStream(res, (v) => guard.push(v));
          used.requests++;
          if (usage) {
            used.input += usage.prompt_tokens ?? 0; used.output += usage.completion_tokens ?? 0;
            console.log(`[assist] usage model=${model} in=${usage.prompt_tokens ?? "?"} out=${usage.completion_tokens ?? "?"} total=${usage.total_tokens ?? "?"}`);
          }
          if (!calls.length) break;
          messages.push({ role: "assistant", content: text || null, tool_calls: calls });
          for (const c of calls) {
            toolCalls++;
            const result = toolCalls > MAX_TOOL_CALLS
              ? { error: "Too many lookups for one question. Answer with what you have." }
              : (send({ t: "status", v: c.function.name }), await runTool(me.role, ctx, c.function.name, c.function.arguments));
            messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(sanitize(result)).slice(0, TOOL_RESULT_CHARS) });
          }
        }
        guard.end();
        console.log(`[assist] question role=${me.role} requests=${used.requests} tools=${toolCalls} in=${used.input} out=${used.output}`);
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

/** Seconds from Groq's retry-after header ("7", "7.5"), or null. */
const retryAfter = (res: Response) => {
  const v = Number.parseFloat(res.headers.get("retry-after") ?? "");
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/**
 * Keeps one request under INPUT_BUDGET estimated tokens: first shortens older
 * tool results and earlier answers, then drops the oldest chat messages, then
 * shortens the latest tool result. Returns the estimate.
 */
function fitBudget(messages: ChatMsg[], toolsJson: string) {
  const est = () => Math.ceil((JSON.stringify(messages).length + toolsJson.length) / 3.5);
  const cut = (m: ChatMsg, n: number) => { if (m.content && m.content.length > n) m.content = m.content.slice(0, n) + "…"; };
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  const toolIdx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  for (const i of toolIdx.slice(0, -1)) if (est() > INPUT_BUDGET) cut(messages[i], 300);
  for (let i = 0; i < lastUser && est() > INPUT_BUDGET; i++) if (messages[i].role === "assistant") cut(messages[i], 160);
  while (est() > INPUT_BUDGET) {
    const i = messages.findIndex((m, j) => j < messages.map((x) => x.role).lastIndexOf("user") && (m.role === "user" || m.role === "assistant"));
    if (i < 0) break;
    messages.splice(i, 1);
  }
  const last = toolIdx.length ? messages.filter((m) => m.role === "tool").pop() : undefined;
  while (last?.content && est() > INPUT_BUDGET && last.content.length > 400) cut(last, Math.floor(last.content.length * 0.8));
  return est();
}

// Per-model request options: reasoning models think (medium, or low when the
// request is large) and never show it.
const modelOptions = (model: string, effort: "low" | "medium") =>
  model.startsWith("openai/gpt-oss") ? { reasoning_effort: effort, max_completion_tokens: 2048 }
  : model.startsWith("qwen/") ? { reasoning_format: "hidden", max_completion_tokens: 1200 }
  : { max_completion_tokens: 1200 };

/**
 * One chat completion call. Tries the models in order; once one works, later
 * calls in the same answer start with it. Rate limited (429): wait and retry
 * once if Groq says 10 s or less, otherwise move on to the next model.
 */
async function groq(base: string, key: string, models: string[], payload: Record<string, unknown>, onRetry: () => void, effort: "low" | "medium") {
  let waited = false;
  while (models.length) {
    const model = models[0];
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, model, ...modelOptions(model, effort) }),
    }).catch((err) => { console.error(`[assist] Groq request failed model=${model}: ${err instanceof Error ? err.message : err}`); throw new GroqError("network"); });
    if (res.ok && res.body) return { body: res.body, model };
    const e = logGroqError(res.status, model, await res.text().catch(() => ""));
    if (res.status === 429) {
      const wait = retryAfter(res);
      if (!waited && wait != null && wait <= MAX_WAIT_S) {
        waited = true;
        onRetry();
        await new Promise((r) => setTimeout(r, Math.ceil(wait * 1000)));
        continue;
      }
      if (models.length > 1) { models.shift(); waited = false; continue; }
      throw new GroqError("rate limited");
    }
    if (retired(res.status, e) && models.length > 1) { models.shift(); waited = false; continue; }
    throw new GroqError(`Groq ${res.status}`);
  }
  throw new GroqError("no model");
}

interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

/**
 * Reads one streamed (SSE) chat completion: passes the answer text on as it
 * comes and collects tool calls and the token usage. Reasoning is never passed
 * on: gpt-oss "reasoning" fields are ignored and any <think>…</think> text
 * (Qwen) is dropped.
 */
async function readStream(body: ReadableStream<Uint8Array>, onText: (v: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "", text = "", pending = "", thinking = false, toolRound = false;
  let usage: Usage | null = null;
  const calls: ToolCall[] = [];
  // Passes text on, holding back anything inside <think>…</think>.
  const emit = (piece: string) => {
    pending += piece;
    for (;;) {
      if (thinking) {
        const end = pending.indexOf("</think>");
        if (end < 0) { pending = pending.slice(-8); return; }
        pending = pending.slice(end + 8); thinking = false;
      } else {
        const start = pending.indexOf("<think>");
        if (start < 0) {
          const keep = pending.lastIndexOf("<") > pending.length - 8 ? pending.length - pending.lastIndexOf("<") : 0;
          const out = pending.slice(0, pending.length - keep);
          pending = pending.slice(pending.length - keep);
          if (out) { text += out; onText(out); }
          return;
        }
        const out = pending.slice(0, start);
        if (out) { text += out; onText(out); }
        pending = pending.slice(start + 7); thinking = true;
      }
    }
  };
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
      let chunk: { error?: { code?: string; type?: string; message?: string }; usage?: Usage; x_groq?: { usage?: Usage };
        choices?: { delta?: { content?: string; reasoning?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) {
        console.error(`[assist] Groq stream error code=${chunk.error.code ?? "-"} type=${chunk.error.type ?? "-"} message=${(chunk.error.message ?? "").slice(0, 300)}`);
        throw new GroqError("stream error");
      }
      const u = chunk.usage ?? chunk.x_groq?.usage;
      if (u) usage = u;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.tool_calls?.length) toolRound = true;
      if (delta?.content && !toolRound) emit(delta.content);
      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.function.name += tc.function.name;
        if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
      }
    }
  }
  if (pending && !thinking && !toolRound) { text += pending; onText(pending); }
  return { text, calls: calls.filter(Boolean), usage };
}
