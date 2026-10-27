/**
 * Server-side format guard for Y2B Assist answers, applied line by line as the
 * answer streams: removes filler / apologies / "As an AI" / tool talk / emojis
 * / exclamation marks, bolds the first line if the model didn't, drops tables
 * whose values are all 0 or empty (and caps tables at 5 rows), and stops at
 * the word limit (always at a line break).
 */
const BANNED: RegExp[] = [
  /\b(great|good|excellent|nice) question\b[^.!?\n]*[.!?]?\s*/gi,
  /^\s*(sure|certainly|of course|absolutely|okay|ok|alright|got it|great)\b[,.!:]*\s*/i,
  /^\s*(here'?s|here is|here are)\b[^:\n]*:\s*/i,
  /\bI hope (this|that|it) helps\b[^.!?\n]*[.!?]?\s*/gi,
  /\blet me know\b[^.!?\n]*[.!?]?\s*/gi,
  /\b(is there )?anything else\b[^.!?\n]*[.!?]?\s*/gi,
  /\b(i'?m|i am)\s+(so |very |really |truly )?sorry\b[^.!?\n]*[.!?]?\s*/gi,
  /\bsorry\b[^.!?\n]*[.!?]?\s*/gi,
  /\b(my )?apolog(y|ies|ise|ize|ised|ized)\b[^.!?\n]*[.!?]?\s*/gi,
  /\bas an ai\b[^.!?\n]*[.!?]?\s*/gi,
  /\b(feel free|happy to help|glad to help)\b[^.!?\n]*[.!?]?\s*/gi,
  /[^.!?\n]*\b(tool|tools|function call)\b[^.!?\n]*[.!?]?\s*/gi,
];
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;
// Zero-width and other invisible characters (they split names like "Ra\u200Bees").
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const isTableLine = (l: string) => l.trim().startsWith("|");
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const words = (l: string) => l.replace(/[*|`#>_-]/g, " ").split(/\s+/).filter(Boolean).length;

// Bare panel paths ("/attendance?month=2026-09", "via /reports") are never shown as text;
// labelled markdown links stay.
const LINK = /\[([^\]\n]+)\]\((\/[^)\s]*)\)/g;
const BARE_PATH = /(?:\b(?:via|at|on|in|from|under|go to|open|see|visit|check)\s+)?(?<![\w)\]/])\/[a-z][\w-]*(?:\/[\w-]+)*(?:\?[\w=&%-]*)?(?:\s+(?:for|to see) (?:more |the )?(?:details|info|breakdown))?/gi;
const OPEN_ONLY = /^\s*(?:[-•]\s*)?(?:\*\*)?next step:?(?:\*\*)?\s*(?:(?:open|go to|see|check|visit|view)\b[^.\n]*?)?\s*[.]?\s*$/i;
const linkLabel = (path: string) => {
  const m = path.match(/month=(\d{4})-(\d{2})/);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (path.startsWith("/attendance")) return m ? `Open ${names[Number(m[2]) - 1]} ${m[1]} attendance` : "Open attendance";
  const page = path.slice(1).split(/[/?]/)[0];
  return page ? `Open ${page}` : "Open the panel";
};
const WORDS: [RegExp, string][] = [
  // "(as per summary)", ", according to the data," — filler about where facts came from.
  [/\s*\((?:as per|according to|based on|per|from) (?:the )?[^)]{0,30}\)/gi, ""],
  [/,?\s*\b(?:as per|according to|based on) (?:the |your )?(?:summary|data|records?|reports?|results?|system|panel)\b,?/gi, ""],
  // Time ranges with a plain hyphen: 10:21-11:09.
  [/(\d{1,2}:\d{2})\s*[–—]\s*(\d{1,2}:\d{2})/g, "$1-$2"],[/\btokens? earned\b/gi, "tokens"], [/\btasks? completed\b/gi, "visits done"], [/\bsite visits? completed\b/gi, "visits done"], [/\bpositive leads\b/gi, "positive calls"]];

function stripPaths(line: string) {
  const links: string[] = [];
  let s = line.replace(LINK, (_m, label: string, path: string) => { links.push(`[${label.trim().startsWith("/") ? linkLabel(path) : label}](${path})`); return `\u0000${links.length - 1}\u0000`; });
  s = s.replace(BARE_PATH, "").replace(/\(\s*\)/g, "").replace(/^(\s*)([.,;:]\s*)+/, "$1");
  // "Next step: open the attendance page." with the link gone (or only a link) → just the link, or nothing.
  if (/next step/i.test(s) && OPEN_ONLY.test(s.replace(/\u0000\d+\u0000/g, ""))) s = links.map((_l, i) => `\u0000${i}\u0000`).join(" ");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => links[Number(i)]);
}

export function cleanLine(line: string) {
  let s = stripPaths(line.replace(INVISIBLE, "").replace(EMOJI, ""));
  for (const re of BANNED) s = s.replace(re, "");
  for (const [re, to] of WORDS) s = s.replace(re, to);
  // A removed opening ("According to the data, …") leaves the rest as the sentence.
  if (!/^\s/.test(line)) s = s.trimStart();
  if (/^[A-Z*]/.test(line.trimStart())) s = s.replace(/^([*\s-]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
  s = s.replace(/!+/g, ".").replace(/\.\s*\.(?!\.)/g, ".").replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trimEnd();
  if (/^[\s.,:;–—-]*$/.test(s)) return "";
  return s;
}

/** "Raees Shaikh had …" → "You had …" when the person is asking about themselves. */
function toYou(line: string, name: string) {
  const full = name.replace(INVISIBLE, "").trim(), names = [full, full.split(/\s+/)[0]].filter((n) => n.length >= 2).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return line;
  const who = `(?:${names.join("|")})`;
  let s = line
    .replace(new RegExp(`^(\\s*(?:[-•]\\s+)?(?:\\*\\*)?)${who}\\s*[:,]\\s*`, "i"), "$1")
    .replace(new RegExp(`\\b${who}(?:'s|’s|')(?=\\s)`, "gi"), "your")
    .replace(new RegExp(`\\b${who}\\s+(has|is|was)\\b`, "gi"), (_m, v: string) => `you ${({ has: "have", is: "are", was: "were" } as Record<string, string>)[v.toLowerCase()]}`)
    .replace(new RegExp(`\\b${who}\\b`, "gi"), "you");
  s = s.replace(/^(\s*(?:[-•]\s+)?(?:\*\*)?)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
  return s;
}

const FILLER = new Set(["then", "click", "tap", "press", "finally", "and", "the", "now", "just", "your", "you", "that", "this", "after", "once", "done"]);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !FILLER.has(w));
/** A closing line that only repeats what was already said (e.g. the last step again). */
const repeats = (line: string, before: string) => {
  const w = norm(line), seen = new Set(norm(before));
  return w.length > 0 && w.filter((x) => seen.has(x)).length / w.length >= 0.8;
};

export function createGuard(emit: (s: string) => void, maxWords: number, selfName?: string) {
  let buf = "", table: string[] = [], count = 0, out = "", stopped = false, first = true, blank = false, started = false;
  // The latest text line is held back one step, so a closing repeat can be dropped.
  let held: string | null = null;
  const send = (piece: string) => { out += piece; emit(piece); };
  const release = () => { if (held !== null) { send(held); held = null; } };
  const put = (line: string, countIt = true, hold = false) => {
    if (stopped) return;
    if (countIt && !first && count + words(line) > maxWords) { stopped = true; return; }
    if (countIt) count += words(line);
    const piece = (started ? "\n" : "") + line;
    started = true; first = false; blank = false;
    release();
    if (hold) held = piece; else send(piece);
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((l) => !isSeparator(l));
    const [head, ...data] = rows;
    const empty = !data.length || data.every((r) => cells(r).slice(1).every((c) => /^(0|0\.0|-|—|–|n\/a|none|)$/i.test(c.replace(/\*/g, ""))));
    if (!empty) {
      if (!first && !blank) put("", false);
      put(head, false); put(`|${cells(head).map(() => "---").join("|")}|`, false);
      for (const r of data.slice(0, 5)) put(r, false);
    }
    table = [];
  };
  const line = (raw: string) => {
    if (stopped) return;
    if (isTableLine(raw)) { table.push(raw); return; }
    flushTable();
    const s = cleanLine(selfName ? toYou(raw.replace(INVISIBLE, ""), selfName) : raw);
    if (!s) { if (!first && !blank && started) { blank = true; } return; }
    if (blank && started) { release(); send("\n"); blank = false; }
    if (first && !s.includes("**")) { const m = s.match(/^(\s*[-•]\s+)?(.*)$/)!; put(`**${m[2].trim()}**`, true, true); return; }
    put(s, true, true);
  };
  return {
    push(text: string) {
      buf += text;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
    },
    end() {
      if (buf) line(buf);
      buf = "";
      flushTable();
      if (held !== null && out && !/\d/.test(held) && repeats(held, out)) held = null;
      release();
      if (!started) put("**I couldn't find that.** Ask about attendance, reports, visits or leave.");
      return out;
    },
  };
}
