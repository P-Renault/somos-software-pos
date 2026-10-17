/* BOOM POS PWA service worker. Cachea la app visitada y recursos estáticos; nunca intercepta APIs de Supabase. */
const VERSION = "boom-pos-pwa-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const PAGE_CACHE = `${VERSION}-pages`;
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const APP_PREFIX = "/_next/static/";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try { await cache.add(new Request(OFFLINE_URL, { cache: "reload" })); } catch (_) { /* fallback: no bloquear instalación */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("boom-pos-") && ![SHELL_CACHE, PAGE_CACHE, STATIC_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/supabase/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const pages = await caches.open(PAGE_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic" && !url.pathname.startsWith("/auth/")) {
          const copy = response.clone();
          await pages.put(request, copy).catch(() => {});
        }
        return response;
      } catch (_) {
        const cached = await pages.match(request);
        if (cached) return cached;
        const shell = await caches.open(SHELL_CACHE);
        return (await shell.match(OFFLINE_URL)) || new Response("BOOM POS está sin conexión. Abre la aplicación con internet una vez y vuelve a intentar.", {status: 503, headers: {"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());
    return;
  }

  if (url.pathname.startsWith(APP_PREFIX) || url.pathname === "/boom-icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return cached || Response.error();
      }
    })());
  }
});
