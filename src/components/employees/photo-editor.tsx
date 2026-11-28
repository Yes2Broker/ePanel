"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { checkImageFile, loadImage, renderPhoto } from "@/lib/avatars";

/** Crop a picked image to a square (circle guide): drag to move, slider to zoom. Saves a 400×400 WebP. */
export function PhotoCropper({ file, onClose, onSave, title = "Crop photo" }: {
  file: File | null; onClose: () => void; onSave: (blob: Blob) => Promise<void>; title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState("");
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // image top-left inside the box, px
  const [V, setV] = useState(280);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setImg(null); setError(""); setZoom(1);
    if (!file) return;
    const url = URL.createObjectURL(file); setSrc(url);
    loadImage(file).then(setImg).catch((e) => setError(e.message));
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { if (box.current) setV(box.current.clientWidth); }, [img]);

  const base = img ? V / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const s = base * zoom;
  const w = img ? img.naturalWidth * s : V, h = img ? img.naturalHeight * s : V;
  const clamp = (o: { x: number; y: number }) => ({ x: Math.min(0, Math.max(V - w, o.x)), y: Math.min(0, Math.max(V - h, o.y)) });
  // Centre on load / keep the centre when zooming.
  useEffect(() => { if (img) setOff(clamp({ x: (V - w) / 2, y: (V - h) / 2 })); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [img, V]);
  const setZoomKeepCentre = (z: number) => {
    const cx = (V / 2 - off.x) / s, cy = (V / 2 - off.y) / s; // centre in image px
    const ns = base * z;
    setZoom(z);
    setOff({ x: Math.min(0, Math.max(V - (img?.naturalWidth ?? 0) * ns, V / 2 - cx * ns)), y: Math.min(0, Math.max(V - (img?.naturalHeight ?? 0) * ns, V / 2 - cy * ns)) });
  };

  const save = async () => {
    if (!img) return;
    setBusy(true); setError("");
    try {
      const blob = await renderPhoto(img, { x: -off.x / s, y: -off.y / s, size: V / s });
      await onSave(blob);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the photo."); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!file} onClose={onClose} title={title} size="sm"
      footer={<div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={onClose} className="justify-center">Cancel</SecondaryButton>
        <PrimaryButton onClick={save} disabled={!img || busy} className="justify-center">{busy ? "Saving…" : "Save photo"}</PrimaryButton>
      </div>}>
      <div className="space-y-3">
        {error && <p role="alert" className="rounded-xl bg-status-dangerBg px-3 py-2 text-sm text-status-danger">{error}</p>}
        <div ref={box} aria-label="Crop area: drag to move" role="img"
          className="relative mx-auto aspect-square w-full max-w-[280px] touch-none select-none overflow-hidden rounded-2xl bg-ink/90"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d && d.id === e.pointerId) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
              style={{ left: off.x, top: off.y, width: w, height: h }} />
          )}
          {/* Circle guide: everything outside the circle is dimmed. */}
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.5)] ring-2 ring-white/80" />
        </div>
        <label className="flex items-center gap-3 text-sm text-ink-muted">
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomKeepCentre(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-brand" />
        </label>
        <p className="text-xs text-ink-faint">Drag the photo to move it. Saved as a small 400 × 400 picture.</p>
      </div>
    </Modal>
  );
}

/** "Change photo" + optional "Remove" buttons: pick → crop → save. */
export function PhotoButtons({ onSave, onRemove, hasPhoto, changeLabel = "Change photo", removeLabel = "Remove photo", cropTitle }: {
  onSave: (blob: Blob) => Promise<void>; onRemove?: () => Promise<void>; hasPhoto: boolean;
  changeLabel?: string; removeLabel?: string; cropTitle?: string;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label={changeLabel}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const bad = checkImageFile(f); if (bad) return toast(bad, "error"); setFile(f); }} />
      <SecondaryButton type="button" onClick={() => input.current?.click()}><Camera className="h-4 w-4" aria-hidden /> {changeLabel}</SecondaryButton>
      {hasPhoto && onRemove && (
        <SecondaryButton type="button" disabled={removing} onClick={async () => {
          setRemoving(true);
          try { await onRemove(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove the photo.", "error"); } finally { setRemoving(false); }
        }}><Trash2 className="h-4 w-4" aria-hidden /> {removing ? "Removing…" : removeLabel}</SecondaryButton>
      )}
      <PhotoCropper file={file} title={cropTitle} onClose={() => setFile(null)} onSave={onSave} />
    </div>
  );
}
