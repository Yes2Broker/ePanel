import React from "react";

/** One dashboard section: a stat tile, a half-width card, or a full-width block. Falsy = nothing to show yet. */
export type Section = { tile: React.ReactNode } | { half: React.ReactNode } | { block: React.ReactNode } | false | null | undefined | 0;

/**
 * Lays the sections out in the person's order. Tiles next to each other share
 * one grid (two per row on phones, four on desktop); so do half-width cards.
 */
export function DashboardGrid({ sections }: { sections: [string, Section][] }) {
  const groups: { kind: "tile" | "half" | "block"; items: [string, React.ReactNode][] }[] = [];
  for (const [id, s] of sections) {
    if (!s) continue;
    const kind = "tile" in s ? "tile" : "half" in s ? "half" : "block";
    const node = "tile" in s ? s.tile : "half" in s ? s.half : s.block;
    const last = groups[groups.length - 1];
    if (last && last.kind === kind && kind !== "block") last.items.push([id, node]);
    else groups.push({ kind, items: [[id, node]] });
  }
  return (
    <>
      {groups.map((g) => {
        const key = g.items[0][0];
        const children = g.items.map(([id, node]) => <div key={id} data-dash={id} className="min-w-0 empty:hidden [&>*]:h-full">{node}</div>);
        if (g.kind === "tile") return <div key={key} className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">{children}</div>;
        if (g.kind === "half") return <div key={key} className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
        return <React.Fragment key={key}>{children}</React.Fragment>;
      })}
    </>
  );
}
