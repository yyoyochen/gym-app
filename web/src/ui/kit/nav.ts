// Navigation-stack logic, pure (tested). Every push is a real history entry
// stamped with its stack index in history.state, so Android's system back
// gesture/button pops the stack, and the direction of any history move can be
// read by comparing indices: lower = pop, higher = push (forward).
// The DOM side lives in navigation.ts.

export type NavDirection = 'push' | 'pop' | 'none';
export type Transition = 'push' | 'pop' | 'none';

/** What we keep in history.state. Other keys are preserved. */
export interface NavState { gbIdx: number; gbTransition?: Transition }

export function readNavState(state: unknown): NavState | null {
  if (!state || typeof state !== 'object') return null;
  const s = state as Partial<NavState>;
  return typeof s.gbIdx === 'number' && Number.isFinite(s.gbIdx) ? { gbIdx: s.gbIdx, gbTransition: s.gbTransition } : null;
}

export interface Classified {
  idx: number;
  direction: NavDirection;
  /** The entry has no index yet (plain <a href="#/…">, typed URL): stamp it with replaceState. */
  stamp: boolean;
}

/** Classify a history change: `prevIdx` is where we were, `state` is the entry we landed on. */
export function classifyNavigation(prevIdx: number, state: unknown): Classified {
  const s = readNavState(state);
  if (!s) return { idx: prevIdx + 1, direction: 'push', stamp: true };
  if (s.gbIdx < prevIdx) return { idx: s.gbIdx, direction: 'pop', stamp: false };
  if (s.gbIdx > prevIdx) return { idx: s.gbIdx, direction: 'push', stamp: false };
  return { idx: s.gbIdx, direction: 'none', stamp: false };
}

/** Tab roots switch instantly (HIG: tab changes don't slide). */
export const TAB_ROOTS = ['today', 'progress', 'history', 'profile'];

export function isTabRoot(path: string): boolean {
  const p = normalizePath(path);
  return TAB_ROOTS.includes(p);
}

/** '#/today/' → 'today'; '' → 'today'. */
export function normalizePath(path: string): string {
  const p = path.replace(/^#?\/?/, '').replace(/\/+$/, '');
  return p || 'today';
}

/**
 * The animation for a move. The entry's own transition wins (set by go()):
 * on a push it's the entry we arrive at, on a pop the entry we leave, so
 * "back" undoes exactly what "forward" did. Tab root ↔ tab root is instant.
 */
export function transitionFor(direction: NavDirection, from: { path: string; transition?: Transition }, to: { path: string; transition?: Transition }): Transition {
  if (direction === 'none') return 'none';
  const declared = direction === 'push' ? to.transition : from.transition;
  if (declared === 'none') return 'none';
  if (isTabRoot(from.path) && isTabRoot(to.path)) return 'none';
  return direction;
}
