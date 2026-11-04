import type { SalesReportRow } from "@/types";

/** Small grey "Filed late (4 Nov)" tag for a report filed on a later day than its date. */
export function FiledLate({ r }: { r: Pick<SalesReportRow, "filedLate" | "filedOn"> }) {
  if (!r.filedLate || !r.filedOn) return null;
  const on = new Date(`${r.filedOn}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-surface px-2 py-0.5 align-middle text-[11px] font-normal text-ink-faint">Filed late ({on})</span>;
}
