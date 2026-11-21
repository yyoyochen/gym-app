// Navigation store over hash routes + the History API (logic in nav.ts).
//   go(path)            push a real history entry (Android back pops it)
//   go(path, {replace}) swap the current entry (redirects, wizard steps)
//   back(fallback)      history.back() when there is an in-app entry below,
//                       else replace with `fallback` and play the pop animation
// Plain <a href="#/…"> links also work: the browser pushes the entry and
// sync() stamps it with the next stack index.
import { useSyncExternalStore } from 'react';
import { classifyNavigation, normalizePath, readNavState, transitionFor, type NavDirection, type Transition } from './nav';
import { deferNav, dropStaleSheetEntries } from './sheetHistory';

export interface NavSnapshot {
  /** Normalised path, e.g. 'history/abc123'. */
  path: string;
  /** Decoded segments, e.g. ['history', 'abc123']. */
  segments: string[];
  /** Stack index of the current entry (history.state.gbIdx). */
  idx: number;
  direction: NavDirection;
  /** Animation to play for the move that produced this snapshot. */
  transition: Transition;
  /** Increments on every move; PageStack keys off it. */
  seq: number;
}

export interface GoOptions {
  replace?: boolean;
  /** Override the animation ('none' for redirects and tab switches). */
  transition?: Transition;
}

const listeners = new Set<() => void>();
let snap: NavSnapshot | null = null;
let entryTransition: Transition | undefined;

const hasWindow = () => typeof window !== 'undefined' && typeof history !== 'undefined';
const currentPath = () => normalizePath(decodeHash(location.hash));
function decodeHash(h: string): string { return h.replace(/^#/, ''); }
const toSegments = (path: string) => path.split('/').map(s => { try { return decodeURIComponent(s); } catch { return s; } });
const stateObj = () => (history.state && typeof history.state === 'object' ? history.state as Record<string, unknown> : {});

function emit(next: NavSnapshot) {
  snap = next;
  listeners.forEach(l => l());
}

function init(): NavSnapshot {
  if (snap) return snap;
  if (!hasWindow()) return (snap = { path: 'today', segments: ['today'], idx: 0, direction: 'none', transition: 'none', seq: 0 });
  try { history.scrollRestoration = 'manual'; } catch { /* old browsers */ }
  const s = readNavState(history.state);
  if (!s) history.replaceState({ ...stateObj(), gbIdx: 0 }, '', location.href);
  entryTransition = s?.gbTransition;
  const path = currentPath();
  snap = { path, segments: toSegments(path), idx: s?.gbIdx ?? 0, direction: 'none', transition: 'none', seq: 0 };
  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);
  dropStaleSheetEntries();
  return snap;
}

/** Reconcile with the browser after popstate/hashchange (both may fire for one move). */
function sync() {
  const cur = init();
  const path = currentPath();
  const c = classifyNavigation(cur.idx, history.state);
  if (!c.stamp && c.idx === cur.idx && path === cur.path) return;
  if (c.stamp) history.replaceState({ ...stateObj(), gbIdx: c.idx }, '', location.href);
  const to = { path, transition: readNavState(history.state)?.gbTransition };
  const transition = transitionFor(c.direction, { path: cur.path, transition: entryTransition }, to);
  entryTransition = to.transition;
  emit({ path, segments: toSegments(path), idx: c.idx, direction: c.direction, transition, seq: cur.seq + 1 });
}

/** Navigate within the app. Paths are like 'session/abc' (leading '#/' optional). */
export function go(path: string, opts: GoOptions = {}): void {
  // A sheet that just closed is still walking back over its history entry.
  if (deferNav(() => go(path, opts))) return;
  const cur = init();
  const target = normalizePath(path);
  const url = '#/' + target;
  if (opts.replace) {
    history.replaceState({ ...stateObj(), gbIdx: cur.idx, gbTransition: opts.transition }, '', url);
    entryTransition = opts.transition;
    emit({ path: target, segments: toSegments(target), idx: cur.idx, direction: 'none', transition: opts.transition ?? 'none', seq: cur.seq + 1 });
    return;
  }
  if (target === cur.path) return;
  const idx = cur.idx + 1;
  history.pushState({ gbIdx: idx, gbTransition: opts.transition }, '', url);
  const transition = transitionFor('push', { path: cur.path, transition: entryTransition }, { path: target, transition: opts.transition });
  entryTransition = opts.transition;
  emit({ path: target, segments: toSegments(target), idx, direction: 'push', transition, seq: cur.seq + 1 });
}

/** Pop one entry. With nothing in-app below (deep link), replace with `fallback` and still animate as a pop. */
export function back(fallback = 'today'): void {
  if (deferNav(() => back(fallback))) return;
  const cur = init();
  if (cur.idx > 0) { history.back(); return; }
  history.replaceState({ ...stateObj(), gbIdx: 0 }, '', '#/' + normalizePath(fallback));
  entryTransition = undefined;
  const path = normalizePath(fallback);
  emit({ path, segments: toSegments(path), idx: 0, direction: 'pop', transition: 'pop', seq: cur.seq + 1 });
}

/** True when back() will pop an in-app entry rather than fall back. */
export function canGoBack(): boolean { return init().idx > 0; }

export function getNav(): NavSnapshot { return init(); }

function subscribe(fn: () => void) {
  init();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The current route; re-renders on every move. */
export function useNav(): NavSnapshot {
  return useSyncExternalStore(subscribe, getNav, getNav);
}
