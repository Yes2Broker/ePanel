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
const isTableLine = (l: string) => l.trim().startsWith("|");
const isSeparator = (l: string) => /^\s*\|?\s*:?-{2,}/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const words = (l: string) => l.replace(/[*|`#>_-]/g, " ").split(/\s+/).filter(Boolean).length;

export function cleanLine(line: string) {
  let s = line.replace(EMOJI, "");
  for (const re of BANNED) s = s.replace(re, "");
  s = s.replace(/!+/g, ".").replace(/\.\s*\.(?!\.)/g, ".").replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trimEnd();
  if (/^[\s.,:;–—-]*$/.test(s)) return "";
  return s;
}

export function createGuard(emit: (s: string) => void, maxWords: number) {
  let buf = "", table: string[] = [], count = 0, out = "", stopped = false, first = true, blank = false;
  const put = (line: string, countIt = true) => {
    if (stopped) return;
    if (countIt && !first && count + words(line) > maxWords) { stopped = true; return; }
    if (countIt) count += words(line);
    const piece = (out ? "\n" : "") + line;
    out += piece; emit(piece); first = false; blank = false;
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
    const s = cleanLine(raw);
    if (!s) { if (!first && !blank && out) { blank = true; } return; }
    if (blank && out) { out += "\n"; emit("\n"); blank = false; }
    if (first && !s.includes("**")) { const m = s.match(/^(\s*[-•]\s+)?(.*)$/)!; put(`**${m[2].trim()}**`); return; }
    put(s);
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
      if (!out) put("**I couldn't find that.** Ask about attendance, reports, visits or leave.");
      return out;
    },
  };
}
