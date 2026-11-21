import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake History API whose traversals land asynchronously (like a browser):
// pushState/replaceState are synchronous, go()/back() fire popstate on flush().
class FakeHistory {
  entries: { url: string; state: unknown }[] = [{ url: '#/today', state: null }];
  i = 0;
  scrollRestoration = 'auto';
  private pending: number[] = [];
  constructor(private fire: (type: string) => void) {}
  get state() { return this.entries[this.i].state; }
  pushState(state: unknown, _t: string, url: string) { this.entries.splice(this.i + 1); this.entries.push({ url, state: clone(state) }); this.i++; }
  replaceState(state: unknown, _t: string, url: string) { this.entries[this.i] = { url, state: clone(state) }; }
  go(n: number) { this.pending.push(n); }
  back() { this.go(-1); }
  /** Let queued traversals land, one popstate each (hashchange only when the URL changed). */
  flush() {
    while (this.pending.length) {
      const n = this.pending.shift()!;
      const from = this.entries[this.i].url;
      const to = Math.max(0, Math.min(this.entries.length - 1, this.i + n));
      if (to === this.i) continue;
      this.i = to;
      this.fire('popstate');
      if (this.entries[to].url !== from) this.fire('hashchange');
    }
  }
  /** The Android system back gesture. */
  systemBack() { this.go(-1); this.flush(); }
}
const clone = (v: unknown) => (v == null ? v : JSON.parse(JSON.stringify(v)));

describe('sheet history entries (Android back closes the sheet, not the page)', () => {
  let h: FakeHistory;
  const handlers: Record<string, (() => void)[]> = {};
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    for (const k of Object.keys(handlers)) delete handlers[k];
    h = new FakeHistory(type => (handlers[type] ?? []).slice().forEach(f => f()));
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('history', h);
    vi.stubGlobal('location', { get hash() { return h.entries[h.i].url; }, get href() { return h.entries[h.i].url; } });
    vi.stubGlobal('addEventListener', (type: string, f: () => void) => { (handlers[type] ??= []).push(f); });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function load() {
    const nav = await import('./navigation');
    const sh = await import('./sheetHistory');
    nav.getNav(); // init: stamps the first entry
    return { nav, sh };
  }

  it('system back with a sheet open closes the sheet and keeps the page', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const seq = nav.getNav().seq;
    const onPop = vi.fn();
    const release = sh.pushSheetEntry(onPop);
    expect(h.entries).toHaveLength(3);
    expect(h.state).toMatchObject({ gbIdx: 1, gbSheet: 1 });
    expect(h.entries[2].url).toBe('#/session/abc');

    h.systemBack();
    expect(onPop).toHaveBeenCalledTimes(1);
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', idx: 1, seq }); // no page move
    expect(sh.sheetDepth()).toBe(0);

    release(); // the sheet unmounting afterwards must not walk back again
    h.flush();
    expect(h.i).toBe(1);
    expect(nav.getNav().path).toBe('session/abc');

    h.systemBack(); // the next back pops the page as usual
    expect(nav.getNav()).toMatchObject({ path: 'today', idx: 0, direction: 'pop' });
  });

  it('closing a sheet normally walks back over its entry without a page pop', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const seq = nav.getNav().seq;
    const onPop = vi.fn();
    const release = sh.pushSheetEntry(onPop);
    release();
    h.flush();
    expect(onPop).not.toHaveBeenCalled();
    expect(h.i).toBe(1);
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', idx: 1, seq });
    h.systemBack();
    expect(nav.getNav().path).toBe('today');
  });

  it('navigating right after closing waits for the walk-back, so the new page survives', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const release = sh.pushSheetEntry(() => {});
    release();
    nav.go('review/abc'); // e.g. Finish confirmed in an action sheet
    expect(nav.getNav().path).toBe('session/abc'); // deferred
    h.flush();
    expect(nav.getNav()).toMatchObject({ path: 'review/abc', idx: 2, direction: 'push' });
    expect(h.entries.map(e => e.url)).toEqual(['#/today', '#/session/abc', '#/review/abc']);
    h.systemBack();
    expect(nav.getNav().path).toBe('session/abc');
  });

  it('nested sheets: back closes only the top one', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const outer = vi.fn(), inner = vi.fn();
    sh.pushSheetEntry(outer);
    const releaseInner = sh.pushSheetEntry(inner);
    expect(h.state).toMatchObject({ gbSheet: 2 });
    h.systemBack();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    releaseInner();
    h.systemBack();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(nav.getNav().path).toBe('session/abc');
  });

  it('releasing the outer sheet while an inner one is up walks back over both', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const releaseOuter = sh.pushSheetEntry(() => {});
    const releaseInner = sh.pushSheetEntry(() => {});
    releaseOuter(); // parent unmounts first
    releaseInner();
    h.flush();
    expect(h.i).toBe(1);
    expect(sh.sheetDepth()).toBe(0);
    expect(nav.getNav().path).toBe('session/abc');
  });

  it('two sheets closed back to back each walk back once', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const a = sh.pushSheetEntry(() => {});
    a();
    const b = sh.pushSheetEntry(() => {}); // reopened before the first back landed
    b();
    h.flush();
    h.flush();
    expect(h.state).toMatchObject({ gbIdx: 1 });
    expect(h.entries[h.i].url).toBe('#/session/abc');
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', idx: 1 });
  });

  it('a sheet left open when the app navigates away is forgotten, not walked back', async () => {
    const { nav, sh } = await load();
    const release = sh.pushSheetEntry(() => {});
    nav.go('lift/squat');
    release(); // the old page unmounted
    h.flush();
    expect(nav.getNav().path).toBe('lift/squat');
    expect(sh.sheetDepth()).toBe(0);
  });

  it('after a reload with a sheet open, start-up steps back off the dead sheet entry', async () => {
    h.entries = [{ url: '#/today', state: { gbIdx: 0 } }, { url: '#/session/abc', state: { gbIdx: 1 } }, { url: '#/session/abc', state: { gbIdx: 1, gbSheet: 1 } }];
    h.i = 2;
    const { nav, sh } = await load(); // init() runs here, as on app start
    expect(nav.getNav()).toMatchObject({ path: 'session/abc', idx: 1 });
    nav.go('review/abc'); // waits for the step back
    h.flush();
    expect(h.entries.map(e => e.url)).toEqual(['#/today', '#/session/abc', '#/review/abc']);
    expect(sh.sheetDepth()).toBe(0);
    h.systemBack();
    expect(nav.getNav().path).toBe('session/abc');
  });

  it('a lost popstate does not wedge navigation', async () => {
    const { nav, sh } = await load();
    nav.go('session/abc');
    const release = sh.pushSheetEntry(() => {});
    release();
    nav.go('review/abc');
    vi.advanceTimersByTime(1000); // no flush: the traversal never reported
    expect(nav.getNav().path).toBe('review/abc');
  });
});
