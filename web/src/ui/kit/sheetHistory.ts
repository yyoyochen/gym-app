// Android back closes the top sheet, not the page.
//
// Opening a Sheet / ActionSheet pushes one history entry over the page's own
// entry: same URL, same gbIdx (so navigation.ts sees "no move" and never pops
// a page for it), stamped with gbSheet = its depth in the sheet stack.
//  · System back (popstate landing below a sheet's depth) → that sheet's
//    onPop runs, which closes it. The page stays.
//  · Closing it any other way (X, backdrop, Esc, save) releases the entry:
//    we go back over it ourselves. Our own popstate is swallowed here and is
//    a no-op for navigation.ts (same gbIdx, same path).
//  · go()/back() called while that back is still in flight wait for it
//    (deferNav), so "close the sheet, then navigate" can't pop the new page.
//  · If the app navigated away with a sheet still open, its entry is no
//    longer current; releasing it then just forgets it.
//  · A reload with a sheet open lands on that sheet's dead entry: at start-up
//    we step back off it (dropStaleSheetEntries), so no back press is wasted.

interface Entry { token: number; onPop: () => void }

const stack: Entry[] = [];
let seq = 0;
let owed = 0;          // entries released but not yet walked back over
let inFlight = false;  // a history.go(-n) of ours is pending
let watchdog: ReturnType<typeof setTimeout> | undefined;
const queue: (() => void)[] = [];
let listening = false;

const hasHistory = () => typeof history !== 'undefined' && typeof location !== 'undefined';
const stateObj = (): Record<string, unknown> => (history.state && typeof history.state === 'object' ? history.state as Record<string, unknown> : {});
const depthOf = (state: unknown): number => {
  const d = state && typeof state === 'object' ? (state as { gbSheet?: unknown }).gbSheet : undefined;
  return typeof d === 'number' && Number.isFinite(d) ? d : 0;
};

function listen() {
  if (listening) return;
  listening = true;
  addEventListener('popstate', onPopState);
}

function onPopState() {
  if (inFlight) { settle(); return; }
  // A user back/forward. Every sheet above the depth we landed on is gone.
  const d = depthOf(history.state);
  const gone = stack.splice(Math.min(d, stack.length));
  for (const e of gone.reverse()) e.onPop();
}

function settle() {
  inFlight = false;
  clearTimeout(watchdog);
  if (owed > 0) { walkBack(); return; }
  const run = queue.splice(0);
  run.forEach(f => f());
}

function walkBack() {
  const n = owed;
  owed = 0;
  inFlight = true;
  // A popstate that never arrives (page hidden mid-traversal) must not wedge navigation.
  watchdog = setTimeout(settle, 800);
  history.go(-n);
}

/**
 * A sheet opened: push its history entry. Returns release(), to call when the
 * sheet closes for any reason (idempotent; a no-op after onPop already ran).
 */
export function pushSheetEntry(onPop: () => void): () => void {
  if (!hasHistory()) return () => {};
  listen();
  const token = ++seq;
  stack.push({ token, onPop });
  history.pushState({ ...stateObj(), gbSheet: stack.length }, '', location.href);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const i = stack.findIndex(e => e.token === token);
    if (i < 0) return; // already popped by system back
    // Our entry (and any above it) should be current, unless the app navigated
    // away with the sheet open: then there is nothing of ours to walk back over.
    const expected = i + 1;
    const ours = inFlight || owed > 0 || depthOf(history.state) >= expected;
    const removed = stack.splice(i);
    if (!ours) return;
    owed += removed.length;
    if (!inFlight) walkBack();
  };
}

/** Start-up: the current entry belongs to a sheet that no longer exists (reload). Walk back off it. */
export function dropStaleSheetEntries(): void {
  if (!hasHistory() || stack.length || inFlight) return;
  const d = depthOf(history.state);
  if (d <= 0) return;
  listen();
  owed += d;
  walkBack();
}

/** True while a sheet's own history.back is pending; `fn` then runs once it has landed. */
export function deferNav(fn: () => void): boolean {
  if (!inFlight && owed === 0) return false;
  queue.push(fn);
  return true;
}

/** Open sheets (top last). For tests and debugging. */
export function sheetDepth(): number { return stack.length; }
