/**
 * Everything sent to Groq goes through here first. Salary, phone numbers,
 * emails, passwords and tokens are removed by field name, and any email
 * address or Indian mobile number left inside text is blanked out.
 */
const DROP = /^(salary|salaries|monthly|final|perDay|mobile|phone|phones|email|emails|password|passwordHash|password_hash|token|p_token|secret|recipients|attachment)$/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

export function scrubText(s: string) {
  return s.replace(EMAIL, "[email hidden]").replace(PHONE, "[phone hidden]");
}

export function sanitize(v: unknown): unknown {
  if (typeof v === "string") return scrubText(v);
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (!DROP.test(k)) out[k] = sanitize(val);
    return out;
  }
  return v;
}
