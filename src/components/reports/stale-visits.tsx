"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { ErrorBanner, Loading, selectCls } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn, formatDate } from "@/lib/utils";

/**
 * Imported visits whose date has passed with no action. They don't block
 * anyone's report; HR/Admin close them here, many at a time.
 */
export function StaleVisits() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.listStaleVisits());
  const [person, setPerson] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => [...new Map((data ?? []).map((v) => [v.employeeId, v.employeeName])).entries()], [data]);
  const visible = (data ?? []).filter((v) => !person || v.employeeId === person);
  const allOn = visible.length > 0 && visible.every((v) => selected.has(v.id));

  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleAll = (on: boolean) => setSelected((s) => { const n = new Set(s); visible.forEach((v) => (on ? n.add(v.id) : n.delete(v.id))); return n; });

  const close = async (status: "Done" | "Cancelled") => {
    const ids = visible.filter((v) => selected.has(v.id)).map((v) => v.id);
    if (!ids.length) return;
    setBusy(true);
    try {
      const n = await api.closeStaleVisits(ids, status, reason);
      toast(`${n} visit${n === 1 ? "" : "s"} marked ${status}.`);
      setSelected(new Set());
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const count = visible.filter((v) => selected.has(v.id)).length;
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-ink-muted">Visits imported from the old sheets whose date has passed with no Done, Reschedule or Cancel. They don&apos;t block anyone&apos;s report. Close them here; visits created in the panel must be handled by the person in their next report.</p>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={cn(selectCls, "col-span-2 md:col-auto")} aria-label="Person">
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancel reason (optional)" aria-label="Cancel reason"
            className="col-span-2 min-h-10 min-w-0 flex-1 rounded-pill border border-surface-border bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand md:col-auto md:text-sm" />
          <PrimaryButton disabled={busy || !count} onClick={() => close("Done")} className="justify-center">Mark {count || ""} Done</PrimaryButton>
          <SecondaryButton disabled={busy || !count} onClick={() => close("Cancelled")} className="justify-center">Mark {count || ""} Cancelled</SecondaryButton>
        </div>
      </Card>
      <ErrorBanner message={error} onRetry={reload} />
      <Card className="overflow-hidden p-0">
        {loading && !data ? <Loading /> : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">No old pending visits.</p>
        ) : (
          <>
          {/* Phones: a tappable row per visit. */}
          <ul className="divide-y divide-surface-border md:hidden">
            <li>
              <label className="flex min-h-12 items-center gap-3 bg-surface px-4 text-xs font-medium text-ink-muted">
                <input type="checkbox" className="h-5 w-5" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} /> Select all ({visible.length})
              </label>
            </li>
            {visible.map((v) => (
              <li key={v.id}>
                <label className={cn("flex items-center gap-3 px-4 py-3", selected.has(v.id) && "bg-brand-soft")}>
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={selected.has(v.id)} onChange={(e) => toggle(v.id, e.target.checked)} aria-label={`Select ${v.client}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-ink">{v.client}</span>
                    <span className="block break-words text-xs text-ink-faint">{v.employeeName} · {v.type === "Normal" ? "Normal" : v.projectName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">{formatDate(v.date)}</span>
                </label>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="bg-surface text-left text-xs text-ink-faint">
                <th className="w-10 px-4 py-2"><input type="checkbox" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all" /></th>
                <th className="px-2 py-2 font-medium">Client</th>
                <th className="px-2 py-2 font-medium">Person</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">Report</th>
                <th className="px-2 py-2 font-medium">Was due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => (
                <tr key={v.id} className={cn("border-t border-surface-border", selected.has(v.id) && "bg-brand-soft")}>
                  <td className="px-4 py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={(e) => toggle(v.id, e.target.checked)} aria-label={`Select ${v.client}`} /></td>
                  <td className="px-2 py-2 font-medium text-ink">{v.client}</td>
                  <td className="px-2 py-2 text-ink-muted">{v.employeeName}</td>
                  <td className="hidden px-2 py-2 text-ink-muted sm:table-cell">{v.type === "Normal" ? "Normal" : v.projectName}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{formatDate(v.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Card>
    </div>
  );
}
