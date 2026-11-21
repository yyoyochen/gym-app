// Haptics via navigator.vibrate (Android Chrome). Silently skipped where the
// API is missing (iOS Safari, desktop). A Settings toggle can call
// setHapticsEnabled(false); nothing persists it yet.
export type HapticKind = 'commit' | 'pr' | 'tick';

const PATTERN: Record<HapticKind, number | number[]> = {
  commit: 10, // set logged
  pr: 10,     // the PR moment
  tick: 6,    // reserved: detent snaps, stepper repeats
};

let enabled = true;

export function setHapticsEnabled(on: boolean): void { enabled = on; }
export function hapticsEnabled(): boolean { return enabled; }

/** Fire a short vibration. Returns true when the browser accepted it. */
export function haptic(kind: HapticKind = 'commit'): boolean {
  if (!enabled) return false;
  try {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    return nav.vibrate(PATTERN[kind]);
  } catch {
    return false;
  }
}
