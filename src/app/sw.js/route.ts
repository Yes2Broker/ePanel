// The service worker, served at /sw.js. It's built once per deploy with that
// deploy's version in it, so phones notice the change and offer "Refresh".
export const dynamic = "force-static";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const CACHE = "y2b-shell-" + VERSION;
const OFFLINE = "/offline";
// Only the app shell and static files. Never API or database responses:
// those go straight to the network (Supabase is another site, so this worker
// never even sees them) and nothing personal is ever stored here.
const SHELL = [OFFLINE, "/manifest.webmanifest", "/favicon.ico", "/icon-192.png", "/icon-512.png",
  "/icon-maskable-512.png", "/apple-touch-icon.png", "/brand/y2b-icon.png", "/brand/yes2broker-logo.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Also keep the CSS/JS the offline page needs.
    const html = await (await cache.match(OFFLINE)).text();
    const assets = [...new Set((html.match(/\\/_next\\/(?:static|image)[^"'\\s)]+/g) || []).map((u) => u.replace(/&amp;/g, "&")))];
    await cache.addAll(assets).catch(() => {});
  })());
  // No skipWaiting here: an update waits until the person taps "Refresh".
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname === "/_next/image" || url.pathname.startsWith("/brand/") ||
  /\\.(?:png|ico|webp|svg|woff2?|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase and other sites: untouched
  if (url.pathname.startsWith("/api/")) return;      // server routes: untouched

  // Pages: always from the network; the offline page if there's no connection.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }

  // Versioned JS/CSS and icons: from the cache, filled in the first time they're used.
  if (isStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })());
  }
  // Everything else (page data for in-app navigation, etc.): network only.
});
`;

export function GET() {
  return new Response(script, {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
