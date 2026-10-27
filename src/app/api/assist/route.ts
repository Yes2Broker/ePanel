import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ASSIST_ENABLED } from "@/lib/features";
import { Role, runTool, toolsFor } from "@/lib/assist/tools";
import { Area, NO_OWN_REPORTS, OWN_ONLY, Perms, areasOf, askLine, filesReports, noAccess } from "@/lib/assist/access";
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
const MAX_WAIT_TOTAL_MS = 12_000; // never wait longer than this on 429s for one question
// Groq's free plan counts tokens: keep each request small.
const HISTORY = 6;          // chat messages sent per request
const TOOL_RESULT_CHARS = 1400;
const INPUT_BUDGET = 1150;  // estimated input tokens per request (≈ 3.5 characters each)

// Hellos and one-word / rude messages get a fixed calm line (no AI call).
const GREETING = /^(hi+|hello+|hey+|hiya|namaste|namaskar|kem cho|good (morning|afternoon|evening))( there| y2b| assist)?$/;
const CASUAL = /^(yo+|sup|wassup|ok+|okay|k+|hmm+|lol|shit|damn|wtf|fuck( (you|off|this))?|bc|mc|thanks?|thank you|thx|ty|cool|nice|fine|acha+|accha+|theek hai|ok thanks?)$/;
// Employees: questions about other people are refused here (plus a name check in the database).
const OTHERS = /\b(who|whom|whose|kaun|kisne|kis ne|kiska|kiski|kiske|team|everyone|everybody|others|other people|colleagues?|sabka|sabki|sabke|sab log|sabhi|all employees|staff)\b/i;
const OWN_WORDS = /\b(my|mine|i|i've|maine|mera|meri|mere|apne|apni|apna)\b/i;
// What a question is about, to answer "you don't have that" without the AI.
const TOPICS: [Area, RegExp][] = [
  ["reports", /\b(reports?|visits?|site|leads?|calls?|tokens?|walk-?ins?|filed|file|bhare|bhara|bhari|summary)\b/i],
  ["attendance", /\b(attendance|lates?|payable|present|absent|punch(es)?|hazri|haziri|short days?|in time|out time)\b/i],
  ["leave", /\b(leaves?|chutti|chhutti|holidays?|comp-?off|time off)\b/i],
];
// Pay questions are refused here, for everyone, without asking the AI.
const SALARY = /\b(salary|salaries|salery|sallary|salry|pay|paid how much|payslips?|pay ?slips?|payroll|ctc|wages?|stipend|in-?hand|take-?home|tankh?wa?h?|tankha|pagar|vetan|kitna milta|kitni milti|kitna milega|kitna mila)\b|वेतन|तनख्वाह|सैलरी|पगार|પગાર|સેલેરી/i;
const NO_SALARY = "Salaries aren't available in Y2B Assist. Admin can see them in Attendance → Salary sheet.";
const EXPIRED = "Your session expired. Please sign in again.";
// Language of the question, so the model is told explicitly how to reply.
const HINGLISH = /\b(ka|ke|ki|ko|kitne|kitna|kitni|batao|bata|bataiye|dikhao|hai|hain|tha|thi|aaya|aayi|aya|maine|mera|meri|mere|kya|kab|kaun|kyun|nahi|nahin|mahine|mahina|aaj|kal|din|karo|kiya|kiye|bhare|bhara|mujhe|hua|hui|wala|wale)\b/i;
const GUJARATI = /\b(che|chhe|shu|kem|maru|mari|mara|ketla|ketli|ketlu|aaje|hatu|hati|nathi|batavo|tamaru|mane)\b/i;
const replyLanguage = (q: string) =>
  /[\u0A80-\u0AFF]/.test(q) ? "Reply in Gujarati." : /[\u0900-\u097F]/.test(q) ? "Reply in Hindi."
  : GUJARATI.test(q) ? "Reply in Gujarati (Roman script)." : HINGLISH.test(q) ? "Reply in Hinglish (Roman script), e.g. \"**Richa: September 2026 me 28 payable days.**\"" : null;
const fixed = (lines: Record<string, unknown>[]) =>
  new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
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
    if (code === "28000") return fixed([{ t: "text", v: EXPIRED }, { t: "done" }]);
    return NextResponse.json({ error: "Y2B Assist isn't turned on for you. Ask Admin." }, { status: 403 });
  }
  const me = use.data as { id: string; name: string; role: Role; today: string; remaining: number };
  const question = history[history.length - 1].content;
  const plain = question.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  const say = (v: string) => fixed([{ t: "meta", remaining: me.remaining }, { t: "text", v }, { t: "done" }]);
  if (SALARY.test(question)) return say(NO_SALARY);
  // The person's Permissions page switches decide which tools exist for them.
  const self = await supabase.rpc("get_me", { p_token: token });
  if (self.error) return self.error.code === "28000" ? fixed([{ t: "text", v: EXPIRED }, { t: "done" }]) : NextResponse.json({ error: BUSY }, { status: 503 });
  const perms = ((self.data as { permissions?: Perms }).permissions ?? {}) as Perms;
  if (GREETING.test(plain) || CASUAL.test(plain)) return say(GREETING.test(plain) ? `Hi ${me.name.split(" ")[0]}. ${askLine(me.role, perms)}` : askLine(me.role, perms));
  if (me.role === "Employee") {
    const named = OTHERS.test(question) || ((await supabase.rpc("assist_mentions_other", { p_token: token, p_text: question })).data === true);
    if (named) return say(OWN_ONLY);
  }
  // "You don't have …" only for people whose menu really lacks that page (HR/Admin always have them).
  const areas = areasOf(me.role, perms), topics = TOPICS.filter(([, re]) => re.test(question)).map(([a]) => a);
  if (topics.length && !topics.some((a) => areas[a])) return say(noAccess(topics[0], me.role, perms));
  // HR/Admin who don't file reports themselves, asking about their own.
  if (me.role !== "Employee" && !filesReports(perms) && topics.includes("reports") && OWN_WORDS.test(question) && !OTHERS.test(question)
      && (await supabase.rpc("assist_mentions_other", { p_token: token, p_text: question })).data !== true) return say(NO_OWN_REPORTS);
  const language = replyLanguage(question);
  const tools = toolsFor(me.role, perms);
  // The period is worked out here, from the whole chat, never by the model.
  const period = resolvePeriod(chat.filter((m) => m.role === "user").map((m) => m.content), me.today);
  const ctx = { token, today: me.today, period, me: { id: me.id, name: me.name }, files: filesReports(perms) };
  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt({ name: me.name, role: me.role, today: me.today }) },
    ...(period || language ? [{ role: "system" as const, content: [period && `Period asked: ${period.label}.`, language].filter(Boolean).join(" ") }] : []),
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
      let toolCalls = 0, final = "";
      const used = { requests: 0, input: 0, output: 0, waitedMs: 0 };
      const guard = createGuard((v) => send({ t: "text", v }), fullList ? 250 : 85);
      const toolsJson = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      try {
        for (let round = 0; round < MAX_TOOL_CALLS + 2; round++) {
          const estimate = fitBudget(messages, JSON.stringify(toolsJson));
          const { body: res, model } = await groq(base, key, models, {
            messages, stream: true, temperature: 0.2, stream_options: { include_usage: true },
            tools: toolsJson, tool_choice: toolCalls >= MAX_TOOL_CALLS ? "none" : "auto",
          }, () => send({ t: "status", v: "__retry" }), estimate > 1000 ? "low" : "medium", used);
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
              : (send({ t: "status", v: c.function.name }), await runTool(me.role, perms, ctx, c.function.name, c.function.arguments));
            // Not theirs / not allowed: that one line is the whole answer, never the model's.
            if ("final" in (result as object)) { final = (result as { final: string }).final; break; }
            messages.push({ role: "tool", tool_call_id: c.id, content: compact(sanitize(result), TOOL_RESULT_CHARS) });
          }
          if (final) break;
        }
        if (final) send({ t: "text", v: final }); else guard.end();
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
/**
 * A tool result as JSON within `max` characters, kept valid: the longest
 * tables lose rows first (with a "more" count), and only then is the text cut.
 */
function compact(result: unknown, max: number) {
  let json = JSON.stringify(result);
  const tables = (v: unknown, out: { rows: unknown[]; more?: number }[] = []) => {
    if (v && typeof v === "object") {
      const o = v as { rows?: unknown[]; more?: number };
      if (Array.isArray(o.rows)) out.push(o as { rows: unknown[]; more?: number });
      for (const x of Object.values(v)) tables(x, out);
    }
    return out;
  };
  while (json.length > max) {
    const t = tables(result).filter((x) => x.rows.length > 1).sort((a, b) => JSON.stringify(b.rows).length - JSON.stringify(a.rows).length)[0];
    if (!t) return json.slice(0, max);
    const keep = Math.max(1, Math.floor(t.rows.length / 2));
    t.more = (t.more ?? 0) + t.rows.length - keep;
    t.rows = t.rows.slice(0, keep);
    json = JSON.stringify(result);
  }
  return json;
}

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
  while (last?.content && est() > INPUT_BUDGET && last.content.length > 400) {
    let parsed: unknown = null;
    try { parsed = JSON.parse(last.content); } catch { /* already cut */ }
    const target = Math.floor(last.content.length * 0.8);
    if (parsed) last.content = compact(parsed, target); else cut(last, target);
  }
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
async function groq(base: string, key: string, models: string[], payload: Record<string, unknown>, onRetry: () => void, effort: "low" | "medium", used: { waitedMs: number }) {
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
      const ms = wait == null ? 0 : Math.ceil(wait * 1000);
      if (!waited && wait != null && wait <= MAX_WAIT_S && used.waitedMs + ms <= MAX_WAIT_TOTAL_MS) {
        waited = true;
        used.waitedMs += ms;
        onRetry();
        await new Promise((r) => setTimeout(r, ms));
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
