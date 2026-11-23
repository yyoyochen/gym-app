// Logger model (pure; tested): one lift's spec-sheet rows, the next set to do,
// which lift is in focus, and the session's set count. Reads the committed
// plan only (LiveSlot.plan is commit.targets, never re-prescribed).
import type { SetEntry, SetKind } from '../../domain/types';
import type { PlannedSet } from '../../engine';
import { setMeetsPlan, type LiveSlot } from '../../app/coach';
import { isUnloaded } from '../../app/labels';
import { loadText } from './text';
import { t } from '../../i18n';

export type RowState = 'logged' | 'next' | 'todo';

export interface SheetRow {
  key: string;
  /** W1 · Top · 1 · 2 … */
  label: string;
  warm: boolean;
  state: RowState;
  weight: number;
  reps: number;
  rir?: number;
  kind: SetKind;
  /** The logged set (state 'logged'). */
  set?: SetEntry;
  /** What tapping a planned row logs (state 'next' | 'todo'). */
  planned?: PlannedSet;
  /** Logged and meets its slice of the promise. */
  met?: boolean;
  /** 1-based position among the lift's warm-ups or working rows, and their count. */
  n: number;
  of: number;
}

export interface LiftRows { rows: SheetRow[]; next: SheetRow | null }

/**
 * Rows in order: warm-ups (logged, then the planned ramp until the first
 * working set), then working rows (logged, then the planned ghosts). After a
 * stop rule that lowers the load, the remaining planned rows carry the safer
 * weight (top sets keep theirs); after a stop, no more planned rows.
 */
export function liftRows(slot: LiveSlot): LiftRows {
  const plan = slot.plan;
  const graded = !!plan && !slot.swapped;
  const warmLogged = slot.sets.filter(s => s.kind === 'warmup');
  const warmLeft = graded && !slot.work.length ? plan!.warmups.slice(warmLogged.length) : [];
  const ghost = graded ? plan!.ghost : [];
  const workN = Math.max(slot.work.length, slot.stopped ? slot.work.length : ghost.length);
  const warmN = warmLogged.length + warmLeft.length;
  const topFirst = graded && plan!.target.model === 'topset';
  const workLabel = (i: number) => (topFirst ? (i === 0 ? 'Top' : String(i)) : String(i + 1));
  const rows: SheetRow[] = [];

  warmLogged.forEach((s, i) => rows.push({
    key: s.id, label: `W${i + 1}`, warm: true, state: 'logged', weight: s.weight, reps: s.reps, kind: s.kind, set: s, met: true, n: i + 1, of: warmN,
  }));
  warmLeft.forEach((w, i) => rows.push({
    key: `w${i}`, label: `W${warmLogged.length + i + 1}`, warm: true, state: 'todo', weight: w.weight, reps: w.reps, kind: 'warmup', planned: w,
    n: warmLogged.length + i + 1, of: warmN,
  }));
  for (let i = 0; i < workN; i++) {
    const s = slot.work[i];
    if (s) {
      const met = graded && !(s.pain && s.pain.severity >= 2) && setMeetsPlan(s, ghost[i], plan!.target.rirFloor);
      rows.push({ key: s.id, label: workLabel(i), warm: false, state: 'logged', weight: s.weight, reps: s.reps, ...(s.rir !== undefined ? { rir: s.rir } : {}), kind: s.kind, set: s, met, n: i + 1, of: workN });
      continue;
    }
    const base = ghost[i];
    const safer = slot.nudge?.kind === 'stop' && slot.nudge.suggestWeight !== undefined && base.kind !== 'top';
    const g: PlannedSet = safer ? { ...base, weight: slot.nudge!.suggestWeight! } : base;
    rows.push({ key: `g${i}`, label: workLabel(i), warm: false, state: 'todo', weight: g.weight, reps: g.reps, ...(g.rir !== undefined ? { rir: g.rir } : {}), kind: g.kind, planned: g, n: i + 1, of: workN });
  }
  const i = rows.findIndex(r => r.state === 'todo');
  if (i >= 0) rows[i] = { ...rows[i], state: 'next' };
  return { rows, next: i >= 0 ? rows[i] : null };
}

/** The lift in focus: the chosen one if it still has a planned set, else the first lift that does. */
export function focusSlot(slots: readonly LiveSlot[], chosen: number | null): LiveSlot | null {
  const has = (s: LiveSlot) => liftRows(s).next !== null;
  const pick = chosen !== null ? slots.find(s => s.slotOrder === chosen) : undefined;
  if (pick && has(pick)) return pick;
  return slots.find(has) ?? null;
}

/** Working sets logged vs planned, over the graded lifts (a stopped lift counts what was done). */
export function sessionCount(slots: readonly LiveSlot[]): { done: number; planned: number } {
  let done = 0, planned = 0;
  for (const s of slots) {
    if (!s.plan || s.swapped) continue;
    done += s.work.length;
    planned += s.stopped ? s.work.length : Math.max(s.plan.ghost.length, s.work.length);
  }
  return { done, planned };
}

/** How long the last logged set can be undone from the logger. */
export const UNDO_MS = 10_000;
export const undoable = (last: { loggedAt: number } | null, now: number): boolean => !!last && now - last.loggedAt <= UNDO_MS;

const kindWord = (k: SetKind): string => (k === 'top' ? t('top set') : k === 'backoff' ? t('back-off') : k === 'drop' ? t('drop set') : '');

/** "Next: set 2 of 4, back-off", "Next: warm-up 1 of 3". */
export function nextLabel(r: SheetRow): string {
  if (r.warm) return t('Next: warm-up {n} of {of}', { n: r.n, of: r.of });
  const kind = kindWord(r.kind);
  return kind ? t('Next: set {n} of {of}, {kind}', { n: r.n, of: r.of, kind }) : t('Next: set {n} of {of}', { n: r.n, of: r.of });
}

/** A row's key as shown: "W1", "Top", "2" (the stored label stays English; the logic compares it). */
export function shownLabel(r: Pick<SheetRow, 'label' | 'warm' | 'n'>): string {
  return r.warm ? t('W{n}', { n: r.n }) : r.label === 'Top' ? t('Top') : r.label;
}

/** The row label of a logged set, for "rested … since set 2". */
export function rowLabelOf(slots: readonly LiveSlot[], setId: string): { lift: string; label: string } | null {
  for (const s of slots) {
    const r = liftRows(s).rows.find(x => x.set?.id === setId);
    if (r) return { lift: s.exercise.name, label: r.warm ? t('warm-up {n}', { n: r.n }) : r.label === 'Top' ? t('the top set') : t('set {n}', { n: r.label }) };
  }
  return null;
}

export interface NextAction {
  /** The planned load is 0 kg on a lift that isn't a bodyweight lift (no history): logging as planned would record a 0 kg set. */
  needsWeight: boolean;
  /** The hero number: the load, or "—" while the weight is unknown. */
  hero: string;
  /** Under the hero, only while the weight is unknown. */
  caption: string | null;
  /** Primary button: logs as planned, or opens the Adjust sheet when the weight is unknown. */
  primaryLabel: string;
}

/** What the logger's hero and primary button say for the next set. A lift with no weight must be set before it can be logged. */
export function nextAction(r: Pick<SheetRow, 'weight'>, bodyweightFactor: number): NextAction {
  const needsWeight = isUnloaded(r.weight, bodyweightFactor);
  return {
    needsWeight,
    hero: loadText(r.weight, bodyweightFactor),
    caption: needsWeight ? t('set the weight') : null,
    primaryLabel: needsWeight ? t('Set weight') : t('Log as planned'),
  };
}

/** Which logger tips qualify: the log tip while a set is next, the undo tip only while Undo is on screen. */
export function loggerTips(o: { hasNext: boolean; sealed: boolean; last: { loggedAt: number } | null; now: number }): { log: boolean; undo: boolean } {
  return { log: o.hasNext && !o.sealed, undo: !o.sealed && undoable(o.last, o.now) };
}
