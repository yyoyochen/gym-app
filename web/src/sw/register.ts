// Registers the service worker in production builds. An update installs in
// the background and waits; `applyUpdate` activates it, and the app only
// offers that between sessions (never during an active one).
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

export function onUpdateReady(fn: () => void) { listeners.add(fn); if (waiting) fn(); return () => listeners.delete(fn); }

export function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const found = (w: ServiceWorker | null) => { if (w && navigator.serviceWorker.controller) { waiting = w; listeners.forEach(f => f()); } };
    if (reg.waiting) found(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') found(w); });
    });
  }).catch(() => { /* offline-first: a failed registration only loses offline support */ });
}

export function applyUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('skip-waiting');
}
