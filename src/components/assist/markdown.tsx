"use client";

import React from "react";
import Link from "next/link";

/**
 * A small, safe markdown renderer for Y2B Assist answers: **bold**, `code`,
 * [links](/panel/path), bullet / numbered lists and simple tables. No HTML is
 * ever injected. Panel links (starting with "/") open inside the panel.
 */
function inline(text: string, onLink?: () => void): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++} className="font-semibold">{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k++} className="rounded bg-surface px-1 py-0.5 text-[0.85em]">{m[2]}</code>);
    else if (m[4].startsWith("/") && !m[4].startsWith("//")) out.push(<Link key={k++} href={m[4]} onClick={onLink} className="font-medium text-brand underline underline-offset-2">{m[3]}</Link>);
    else if (/^https?:\/\//.test(m[4])) out.push(<a key={k++} href={m[4]} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">{m[3]}</a>);
    else out.push(m[3]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text, onLink }: { text: string; onLink?: () => void }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k++} className="my-1 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            {head && <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-surface-border px-2 py-1 font-semibold">{inline(c, onLink)}</th>)}</tr></thead>}
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className="border-b border-surface-border/60 px-2 py-1">{inline(c, onLink)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*[-*•]\s+/, num = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || num.test(line)) {
      const ordered = num.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? num : bullet).test(lines[i])) { items.push(lines[i].replace(ordered ? num : bullet, "")); i++; }
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={k++} className={`my-1 space-y-0.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((it, j) => <li key={j}>{inline(it, onLink)}</li>)}</L>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("|") && !bullet.test(lines[i]) && !num.test(lines[i])) {
      para.push(lines[i].replace(/^#+\s*/, "")); i++;
    }
    blocks.push(<p key={k++} className="my-1">{para.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(p, onLink)}</React.Fragment>)}</p>);
  }
  return <>{blocks}</>;
}
