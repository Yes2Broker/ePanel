"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/ui/modal";

export interface Suggestion { value: string; note: string }

/**
 * A text field with the panel's own suggestion list (not the browser's
 * datalist/autofill): filters as you type, ↑/↓/Enter, click outside closes.
 * Any other value can still be typed.
 */
export function SuggestInput({ value, onChange, suggestions, placeholder, type = "text", inputMode, empty, label }: {
  value: string; onChange: (v: string) => void; suggestions: Suggestion[]; placeholder?: string;
  type?: "text" | "email" | "tel"; inputMode?: "text" | "email" | "tel"; empty: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  // A random name/id each time the field appears, so Chrome can't match it to saved addresses.
  const [fieldId] = useState(() => `f-${Math.random().toString(36).slice(2, 10)}`);
  const q = value.trim().toLowerCase().replace(/\s/g, "");
  const shown = suggestions.filter((s) => !q || s.value.toLowerCase().includes(q));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); };
  return (
    <div ref={box} className="relative">
      {/* Always type="text" + new-password + a random name: stops Chrome's own autofill popup
          (saved emails / "Manage addresses") from covering this list. */}
      <input type="text" inputMode={type === "tel" ? "numeric" : type === "email" ? "email" : inputMode} value={value} placeholder={placeholder} aria-label={label}
        id={fieldId} name={fieldId} autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        data-lpignore="true" data-form-type="other"
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active].value); }
          // Escape closes just the list (not the dialog around it).
          else if (e.key === "Escape" && open) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
          else if (e.key === "Tab") setOpen(false);
        }}
        className={inputCls} />
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-surface-border bg-white p-1 shadow-lg">
          {!suggestions.length ? <li className="px-3 py-2.5 text-sm text-ink-faint">{empty}</li>
            : !shown.length ? <li className="px-3 py-2.5 text-sm text-ink-faint">No match. Your typed value will be saved as it is.</li>
            : shown.map((s, i) => (
              <li key={s.value} role="option" aria-selected={i === active}>
                <button type="button" onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.value)}
                  className={cn("flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left", i === active ? "bg-surface" : "")}>
                  <span className="truncate text-sm font-semibold text-ink">{s.value}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{s.note}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
