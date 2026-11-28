"use client";

import { useRef, useState } from "react";
import { Images, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PhotoButtons } from "@/components/employees/photo-editor";
import { centerSquare, checkImageFile, removePhoto, uploadPhoto, usePhotos } from "@/lib/avatars";
import { cn, initials } from "@/lib/utils";
import type { Employee } from "@/types";

/**
 * Employees → Add / Edit: the DEFAULT photo (HR / Admin). Editing saves at once;
 * adding keeps the cropped photo until the employee is created.
 */
export function DefaultPhotoField({ employee, name, pending, onPending }: {
  employee: { id: string; name: string } | null; name: string; pending: Blob | null; onPending: (b: Blob | null) => void;
}) {
  const toast = useToast();
  const photos = usePhotos();
  const p = employee ? photos[employee.id] : undefined;
  const [preview, setPreview] = useState<string | null>(null);
  const showPending = (b: Blob | null) => { setPreview((old) => { if (old) URL.revokeObjectURL(old); return b ? URL.createObjectURL(b) : null; }); onPending(b); };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border p-3" aria-label="Default photo">
      {!employee && preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="New default photo" className="h-14 w-14 rounded-full object-cover" />
      ) : employee ? <Avatar name={employee.name} id={employee.id} className="h-14 w-14 text-base" />
        : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-base font-medium text-white">{initials(name || "?")}</span>}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-medium text-ink">Default photo</p>
          <p className="text-xs text-ink-faint">
            {employee ? (p?.hasOwn ? "They've set their own photo; it shows instead." : p?.hasDefault ? "Shown until they set their own." : "None yet: their initials show.")
              : pending ? "Saved when you add the employee." : "Optional. Shown until they set their own."}
          </p>
        </div>
        <PhotoButtons
          hasPhoto={employee ? !!p?.hasDefault : !!pending}
          changeLabel={(employee ? p?.hasDefault : pending) ? "Replace default photo" : "Upload default photo"}
          removeLabel="Remove default photo" cropTitle="Default photo"
          onSave={async (blob) => {
            if (!employee) { showPending(blob); return; }
            await uploadPhoto(employee.id, "default", blob); toast("Default photo saved.");
          }}
          onRemove={async () => {
            if (!employee) { showPending(null); return; }
            await removePhoto(employee.id, "default"); toast("Default photo removed.");
          }} />
      </div>
    </div>
  );
}

/** Employee details: HR / Admin can remove someone's OWN photo (the default shows again). */
export function RemoveOwnPhoto({ employee }: { employee: Pick<Employee, "id" | "name"> }) {
  const toast = useToast();
  const photos = usePhotos();
  const [busy, setBusy] = useState(false);
  if (!photos[employee.id]?.hasOwn) return null;
  return (
    <SecondaryButton disabled={busy} onClick={async () => {
      setBusy(true);
      try { await removePhoto(employee.id, "own"); toast(`Removed ${employee.name}'s own photo.`); }
      catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove the photo.", "error"); } finally { setBusy(false); }
    }}><Trash2 className="h-4 w-4" aria-hidden /> {busy ? "Removing…" : "Remove their own photo"}</SecondaryButton>
  );
}

/** Bulk default photos: pick many files named by employee code (EMP003.jpg …), preview, save. */
export function BulkPhotos({ employees }: { employees: Employee[] }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<{ file: File; url: string; emp: Employee | null; problem: string | null; state: "" | "saving" | "done" | "error" }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    setRows(Array.from(files).map((file) => {
      const code = file.name.replace(/\.[^.]+$/, "").trim().toUpperCase();
      const emp = employees.find((e) => e.id.toUpperCase() === code) ?? null;
      return { file, url: URL.createObjectURL(file), emp, problem: checkImageFile(file) ?? (emp ? null : "No employee with this code"), state: "" };
    }));
  };
  const close = () => { rows?.forEach((r) => URL.revokeObjectURL(r.url)); setRows(null); };
  const ok = (rows ?? []).filter((r) => !r.problem);
  const save = async () => {
    setBusy(true);
    let done = 0;
    for (let i = 0; i < (rows ?? []).length; i++) {
      const r = rows![i];
      if (r.problem || r.state === "done") continue;
      setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, state: "saving" } : x)));
      try {
        await uploadPhoto(r.emp!.id, "default", await centerSquare(r.file));
        done++; setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, state: "done" } : x)));
      } catch (e) {
        setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, state: "error", problem: e instanceof Error ? e.message : "Failed" } : x)));
      }
    }
    setBusy(false);
    toast(`${done} default ${done === 1 ? "photo" : "photos"} saved.`);
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="Bulk photos"
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <SecondaryButton onClick={() => input.current?.click()}><Images className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Bulk</span> photos</SecondaryButton>
      <Modal open={!!rows} onClose={close} title="Bulk default photos" subtitle="Files are matched by name to employee codes (EMP003.jpg → EMP003). Each is cropped to the centre."
        footer={<div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={close} className="justify-center">Close</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy || !ok.length || ok.every((r) => r.state === "done")} className="justify-center">{busy ? "Saving…" : `Save ${ok.length} ${ok.length === 1 ? "photo" : "photos"}`}</PrimaryButton>
        </div>}>
        <ul aria-label="Photos to save" className="divide-y divide-surface-border">
          {(rows ?? []).map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-ink">{r.file.name}</p>
                <p className={cn("text-xs", r.problem ? "text-status-danger" : "text-ink-muted")}>{r.problem ?? `${r.emp!.name} (${r.emp!.id})`}</p>
              </div>
              <span className="shrink-0 text-xs text-ink-faint">{r.state === "saving" ? "Saving…" : r.state === "done" ? "Saved" : ""}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
