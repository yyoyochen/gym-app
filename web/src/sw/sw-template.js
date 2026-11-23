/* GymBro service worker: precache everything, serve cache-first, no network
   features. Updates install in the background and wait; the app decides when
   to activate (never during an active session). */
const VERSION = '__VERSION__';
const APP_VERSION = '__APP_VERSION__';
const CACHE = `gymbro-${VERSION}`;
const PRECACHE = __PRECACHE__;
// Fetched on first use and kept (the Chinese fonts): see LAZY_ASSET in plugin.ts.
const LAZY = new RegExp(__LAZY__);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  // Fonts kept on first use (LAZY) move into the new cache before the old ones
  // go, so 中文 still has its fonts offline after an update.
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const next = await caches.open(CACHE);
      for (const k of keys.filter((k) => k !== CACHE)) {
        const old = await caches.open(k);
        for (const req of await old.keys()) {
          if (LAZY.test(new URL(req.url).pathname)) { const res = await old.match(req); if (res) await next.put(req, res); }
        }
        await caches.delete(k);
      }
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  // The page asks a waiting worker which version it carries, for the update banner.
  if (event.data && event.data.type === 'version' && event.ports[0]) event.ports[0].postMessage(APP_VERSION);
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (event.request.mode === 'navigate') return caches.match('./');
      if (LAZY.test(url.pathname)) {
        return fetch(event.request).then((res) => {
          if (res.ok) { const copy = res.clone(); event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy))); }
          return res;
        });
      }
      return fetch(event.request);
    }),
  );
});
