"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSessionToken } from "@/lib/api";

/**
 * Profile photos (own, else default, else initials). One shared store: the
 * signed URLs for everyone's photo, loaded once and refreshed after any change
 * (and before the 1-hour signed URLs expire), so a new photo shows everywhere
 * at once. Files are private; see src/app/api/avatar/route.ts.
 */
export interface PhotoInfo { url: string | null; v: number; hasDefault: boolean; hasOwn: boolean }
type Photos = Record<string, PhotoInfo>;

let photos: Photos = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const FRESH = 45 * 60 * 1000;

async function load() {
  const token = getSessionToken();
  if (!token) return;
  try {
    const r = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "urls" }) });
    if (!r.ok) return;
    const j = await r.json() as { photos?: Photos };
    photos = j.photos ?? {}; loadedAt = Date.now(); emit();
  } catch { /* offline: keep what we have */ }
}

/** Reload everyone's photos (after an upload / removal). */
export function refreshPhotos() {
  loading = load().finally(() => { loading = null; });
  return loading;
}

function ensure() {
  if (!loading && Date.now() - loadedAt > FRESH) refreshPhotos();
}

/** Everyone's photos; re-renders when they change. */
export function usePhotos(): Photos {
  const snap = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => photos, () => photos);
  useEffect(() => { ensure(); }, []);
  return snap;
}

/** Upload a processed photo (WebP blob) to a slot. */
export async function uploadPhoto(employeeId: string, slot: "default" | "own", blob: Blob) {
  const fd = new FormData();
  fd.append("token", getSessionToken() ?? ""); fd.append("employeeId", employeeId); fd.append("slot", slot);
  fd.append("file", blob, `${employeeId}.webp`);
  const r = await fetch("/api/avatar", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Couldn't save the photo.");
  await refreshPhotos();
}

export async function removePhoto(employeeId: string, slot: "default" | "own") {
  const r = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: getSessionToken(), action: "remove", employeeId, slot }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Couldn't remove the photo.");
  await refreshPhotos();
}

// ---------------------------------------------------------------------------
// Image processing (in the browser): crop a square, resize to 400×400 WebP.
// ---------------------------------------------------------------------------
export const PHOTO_SIZE = 400;
export const MAX_UPLOAD = 2 * 1024 * 1024;
/** Picked files can be bigger (phone photos); they are shrunk before upload. */
export const MAX_PICK = 15 * 1024 * 1024;

export function checkImageFile(f: File): string | null {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif|bmp)$/i.test(f.type) && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name)) return "Please choose an image (JPG, PNG or WebP).";
  if (f.size > MAX_PICK) return "That image is too big. Choose one under 15 MB.";
  return null;
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image can't be opened. Try a JPG or PNG.")); };
    img.src = url;
  });
}

/** Square crop (sx, sy, side in image pixels) → 400×400 WebP (~30 KB). */
export async function renderPhoto(img: HTMLImageElement, crop: { x: number; y: number; size: number }): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = PHOTO_SIZE; c.height = PHOTO_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  for (const q of [0.82, 0.7, 0.55]) {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", q));
    if (b && b.size <= MAX_UPLOAD) return b;
  }
  throw new Error("Couldn't prepare the photo.");
}

/** Centre square crop (bulk upload). */
export async function centerSquare(file: Blob) {
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  return renderPhoto(img, { x: (img.naturalWidth - side) / 2, y: (img.naturalHeight - side) / 2, size: side });
}
