"use client";

import { useState } from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/pills";
import { ErrorBanner, Loading } from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Project } from "@/types";

/** Add, rename, close and reopen sole selling projects. */
export function ProjectsPanel() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.listProjects());
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (id: string | null, newName: string, status: Project["status"] | null, done?: string) => {
    setBusy(true);
    try {
      await api.saveProject(id, newName, status);
      toast(done ?? "Saved.");
      setEditing(null);
      setName("");
      reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) save(null, name, null, `${name.trim()} added.`); }} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name, e.g. Nandanvan" aria-label="New project name"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-surface-border px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-dark focus:outline-none focus:ring-2 focus:ring-brand" />
          <PrimaryButton type="submit" disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Add</PrimaryButton>
        </form>
        <p className="mt-2 text-xs text-ink-faint">Closed projects can&apos;t get new reports; their history stays. Assign people on the Permissions page.</p>
      </Card>
      <ErrorBanner message={error} onRetry={reload} />
      <Card className="overflow-hidden p-0">
        {loading && !data ? <Loading /> : (data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {(data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {editing?.id === p.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); save(p.id, editing.name, null, "Renamed."); }} className="flex min-w-0 flex-1 gap-2">
                    <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} aria-label="Project name"
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-surface-border px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    <button type="submit" disabled={busy} className="flex h-11 w-11 items-center justify-center rounded-lg text-status-success hover:bg-surface" aria-label="Save name"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEditing(null)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-surface" aria-label="Cancel"><X className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-faint">{p.people ?? 0} people assigned · {p.reports ?? 0} reports</p>
                    </div>
                    <StatusPill status={p.status} />
                    <button onClick={() => setEditing({ id: p.id, name: p.name })} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-surface" aria-label={`Rename ${p.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                    <SecondaryButton disabled={busy} onClick={() => save(p.id, p.name, p.status === "Active" ? "Closed" : "Active", p.status === "Active" ? `${p.name} closed.` : `${p.name} reopened.`)}>
                      {p.status === "Active" ? "Close" : "Reopen"}
                    </SecondaryButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
