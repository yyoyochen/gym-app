import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyNavigation, isTabRoot, normalizePath, readNavState, transitionFor } from './nav';

describe('history-index navigation logic', () => {
  it('reads only well-formed state', () => {
    expect(readNavState(null)).toBeNull();
    expect(readNavState({ gbIdx: 'x' })).toBeNull();
    expect(readNavState({ gbIdx: 3, other: 1 })).toEqual({ gbIdx: 3, gbTransition: undefined });
  });

  it('an unstamped entry (plain link) is a push to idx + 1 and needs stamping', () => {
    expect(classifyNavigation(4, null)).toEqual({ idx: 5, direction: 'push', stamp: true });
  });

  it('a lower index is a pop (Android back), a higher one is forward', () => {
    expect(classifyNavigation(4, { gbIdx: 3 })).toEqual({ idx: 3, direction: 'pop', stamp: false });
    expect(classifyNavigation(4, { gbIdx: 1 }).direction).toBe('pop');
    expect(classifyNavigation(2, { gbIdx: 3 })).toEqual({ idx: 3, direction: 'push', stamp: false });
    expect(classifyNavigation(2, { gbIdx: 2 }).direction).toBe('none');
  });

  it('normalises paths', () => {
    expect(normalizePath('#/today/')).toBe('today');
    expect(normalizePath('')).toBe('today');
    expect(normalizePath('/history/abc')).toBe('history/abc');
    expect(isTabRoot('#/progress')).toBe(true);
    expect(isTabRoot('lift/squat')).toBe(false);
  });

  it('chooses the animation: tab roots instant, declared transitions win, pop undoes push', () => {
    expect(transitionFor('push', { path: 'today' }, { path: 'session/1' })).toBe('push');
    expect(transitionFor('pop', { path: 'session/1' }, { path: 'today' })).toBe('pop');
    expect(transitionFor('push', { path: 'today' }, { path: 'progress' })).toBe('none');
    expect(transitionFor('push', { path: 'lift/x' }, { path: 'today', transition: 'none' })).toBe('none');
    // popping back from an entry that arrived without animation stays instant
    expect(transitionFor('pop', { path: 'today', transition: 'none' }, { path: 'lift/x' })).toBe('none');
    expect(transitionFor('none', { path: 'a' }, { path: 'b' })).toBe('none');
  });
});

// The store over a fake History API: what Android back / links / go() produce.
class FakeHistory {
  entries: { url: string; state: unknown }[] = [{ url: '#/today', state: null }];
  i = 0;
  scrollRestoration = 'auto';
  constructor(private fire: (type: string) => void) {}
  get state() { return this.entries[this.i].state; }
  pushState(state: unknown, _t: string, url: string) { this.entries.splice(this.i + 1); this.entries.push({ url, state: clone(state) }); this.i++; }
  replaceState(state: unknown, _t: string, url: string) { this.entries[this.i] = { url, state: clone(state) }; }
  back() { if (this.i > 0) { this.i--; this.fire('popstate'); this.fire('hashchange'); } }
  /** A plain <a href> click: new entry with null state, both events fire. */
  click(url: string) { this.entries.splice(this.i + 1); this.entries.push({ url, state: null }); this.i++; this.fire('popstate'); this.fire('hashchange'); }
}
const clone = (v: unknown) => (v == null ? v : JSON.parse(JSON.stringify(v)));

describe('navigation store (fake history)', () => {
  let h: FakeHistory;
  const handlers: Record<string, (() => void)[]> = {};
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(handlers)) delete handlers[k];
    h = new FakeHistory(type => (handlers[type] ?? []).forEach(f => f()));
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('history', h);
    vi.stubGlobal('location', { get hash() { return h.entries[h.i].url; }, get href() { return h.entries[h.i].url; } });
    vi.stubGlobal('addEventListener', (type: string, f: () => void) => { (handlers[type] ??= []).push(f); });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stamps the first entry, pushes on go(), pops on back', async () => {
    const nav = await import('./navigation');
    expect(nav.getNav()).toMatchObject({ path: 'today', idx: 0 });
    expect(h.state).toEqual({ gbIdx: 0 });
    nav.go('session/abc');
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', segments: ['session', 'abc'], idx: 1, direction: 'push', transition: 'push' });
    nav.go('review/abc');
    expect(nav.getNav().idx).toBe(2);
    h.back(); // Android back gesture
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', idx: 1, direction: 'pop', transition: 'pop' });
    nav.back();
    expect(nav.getNav()).toMatchObject({ path: 'today', idx: 0, direction: 'pop' });
  });

  it('stamps plain link clicks once even though popstate and hashchange both fire', async () => {
    const nav = await import('./navigation');
    const seen: number[] = [];
    const { idx: start, seq } = nav.getNav();
    h.click('#/lift/squat');
    seen.push(nav.getNav().seq - seq);
    expect(nav.getNav()).toMatchObject({ path: 'lift/squat', idx: start + 1, direction: 'push' });
    expect(seen).toEqual([1]);
    expect(h.state).toEqual({ gbIdx: start + 1 });
  });

  it('replace keeps the index; back() with nothing below falls back with a pop', async () => {
    const nav = await import('./navigation');
    nav.go('onboarding', { replace: true, transition: 'none' });
    expect(nav.getNav()).toMatchObject({ path: 'onboarding', idx: 0, direction: 'none', transition: 'none' });
    expect(h.entries).toHaveLength(1);
    expect(nav.canGoBack()).toBe(false);
    nav.back('progress');
    expect(nav.getNav()).toMatchObject({ path: 'progress', idx: 0, direction: 'pop', transition: 'pop' });
  });

  it('tab switches are instant, and so is popping back over them', async () => {
    const nav = await import('./navigation');
    nav.go('lift/squat');
    nav.go('today', { transition: 'none' });
    expect(nav.getNav().transition).toBe('none');
    h.back();
    expect(nav.getNav()).toMatchObject({ path: 'lift/squat', direction: 'pop', transition: 'none' });
    h.back();
    expect(nav.getNav()).toMatchObject({ path: 'today', direction: 'pop', transition: 'pop' });
  });

  it('go() to the current path adds no entry', async () => {
    const nav = await import('./navigation');
    nav.go('today');
    expect(h.entries).toHaveLength(1);
  });
});
