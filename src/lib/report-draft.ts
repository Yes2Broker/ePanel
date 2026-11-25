/**
 * Daily report drafts, kept in this browser only (localStorage), so nothing
 * typed is ever lost: while typing, when the report date changes, when the
 * person leaves the page or the phone reloads it. One draft per filer +
 * person + report (type / project) + date, or per report when editing.
 * Removed after a successful submit, and after 3 days.
 */
const PREFIX = "y2b-report-draft:";
const MAX_AGE = 3 * 24 * 3600 * 1000;

export function reportDraftKey(k: { filer?: string | null; employee: string; type: string; project?: string | null; date: string; reportId?: string | null }) {
  return k.reportId
    ? `${PREFIX}${k.filer ?? ""}:edit:${k.reportId}`
    : `${PREFIX}${k.filer ?? ""}:${k.employee}:${k.type}:${k.project ?? ""}:${k.date}`;
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as { savedAt: number; data: T };
    if (!d?.savedAt || Date.now() - d.savedAt > MAX_AGE) { localStorage.removeItem(key); return null; }
    return d.data;
  } catch { return null; }
}

export function saveDraft<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* storage full / private mode */ }
}

export function removeDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Drop drafts older than 3 days. */
export function purgeOldDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) loadDraft(k);
    }
  } catch { /* ignore */ }
}

/**
 * The typed values moved to another report date. The next form uses it to skip
 * the "Draft restored" bar, and the page to offer going back when that date
 * turns out to be filled already.
 */
let carry: { fromKey: string; toKey: string; fromDate: string } | null = null;
export const setCarry = (c: typeof carry) => { carry = c; };
export const getCarry = () => carry;
