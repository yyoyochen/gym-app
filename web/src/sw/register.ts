// Registers the service worker in production builds. An update installs in
// the background and waits; the Today banner (app/parts/UpdateBanner.tsx)
// names its version and activates it on tap, never during an active session.
import { useSyncExternalStore } from 'react';

let waiting: ServiceWorker | null = null;
/** The waiting worker's version, once it has answered; null until then (or if it never does). */
let waitingVersion: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

export function onUpdateReady(fn: () => void) { listeners.add(fn); if (waiting) fn(); return () => listeners.delete(fn); }

/** Ask a waiting worker which version it carries. */
function askVersion(w: ServiceWorker) {
  const ch = new MessageChannel();
  ch.port1.onmessage = e => { if (typeof e.data === 'string' && e.data) { waitingVersion = e.data; emit(); } };
  w.postMessage({ type: 'version' }, [ch.port2]);
}

export function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const found = (w: ServiceWorker | null) => {
      if (w && navigator.serviceWorker.controller) { waiting = w; waitingVersion = null; askVersion(w); emit(); }
    };
    if (reg.waiting) found(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') found(w); });
    });
    // An installed app can sit in the background for days: look again whenever it comes back.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => { /* offline-first: a failed registration only loses offline support */ });
}

export function applyUpdate() {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('skip-waiting');
}

const snapshot = () => (waiting ? `ready|${waitingVersion ?? ''}` : '');

/** Whether an update is waiting, and its version when known. */
export function useUpdate(): { ready: boolean; version: string | null } {
  const s = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, snapshot, () => '');
  return { ready: s.startsWith('ready'), version: s.split('|')[1] || null };
}
