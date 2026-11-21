// Haptics preference: stored in meta ('haptics', default on) and applied to
// haptic() via setHapticsEnabled. Mirrors useTheme: initHaptics() once at
// startup, useHaptics() in Settings.
import { useSyncExternalStore } from 'react';
import { getDb, getMeta, setMeta } from '../../db';
import { hapticsEnabled, setHapticsEnabled } from './haptic';

const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

/** Call once at startup: reads the stored preference (missing = on). */
export function initHaptics(): void {
  getMeta(getDb(), 'haptics').then(v => { setHapticsEnabled(v !== false); emit(); }, () => {});
}

export async function setHapticsPref(on: boolean): Promise<void> {
  setHapticsEnabled(on);
  emit();
  await setMeta(getDb(), 'haptics', on);
}

export function useHaptics(): { enabled: boolean; setEnabled: (on: boolean) => Promise<void> } {
  const enabled = useSyncExternalStore(fn => { subs.add(fn); return () => { subs.delete(fn); }; }, hapticsEnabled, () => true);
  return { enabled, setEnabled: setHapticsPref };
}
