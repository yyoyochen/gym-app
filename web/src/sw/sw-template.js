/* GymBro service worker: precache everything, serve cache-first, no network
   features. Updates install in the background and wait; the app decides when
   to activate (never during an active session). */
const VERSION = '__VERSION__';
const APP_VERSION = '__APP_VERSION__';
const CACHE = `gymbro-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
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
      return fetch(event.request);
    }),
  );
});
