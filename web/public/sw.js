/**
 * Offline shell.
 *
 * Two cache policies, chosen around the network this runs on:
 *
 *   assets   cache-first, indefinitely. 3D models, posters and schematics are
 *            content-hashed, so a name never refers to different bytes.
 *   pages    network-first with a cache fallback, so a worker who loses signal
 *            mid-shift still gets the last version of a lesson rather than a
 *            browser error page.
 *
 * API responses are deliberately NOT cached here — stale progress or stale
 * assessment state is worse than no answer.
 */

const VERSION = 'v4';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.endsWith(VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isAsset =
    /\.(glb|gltf|ktx2|bin|webp|png|jpg|svg|woff2)$/.test(url.pathname) ||
    url.pathname.startsWith('/_next/static/');

  if (isAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && request.mode === 'navigate') {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached ?? caches.match(OFFLINE_URL);
      }
    })()
  );
});
