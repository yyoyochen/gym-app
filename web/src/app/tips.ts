// In-place tips (docs/superpowers/specs/2026-11-23-first-five-minutes-design.md):
// six short notes, each shown once where the thing it explains first appears,
// plus a goal nudge a week in. meta.tipsSeen holds the ids already dismissed;
// unset means "not decided yet" and shows nothing, so an existing user never
// sees a tip flash before startup marks them all seen.
import { getMeta, setMeta, type GymDb } from '../db';
import { daysBetween } from '../engine/dates';
import type { ISODate } from '../domain/types';
import { t } from '../i18n';

export const TIP_IDS = ['promise', 'log', 'undo', 'grade', 'readiness', 'progress'] as const;
export type TipId = typeof TIP_IDS[number];
export type CardId = TipId | 'goalNudge';
const ALL_CARDS: CardId[] = [...TIP_IDS, 'goalNudge'];

// Getters, so each read follows the current language.
export const TIP_TEXT: Record<TipId, string> = {
  get promise() { return t("This is today's plan: the numbers to hit, with the reason under them. It locks when you start, and the session is graded against it."); },
  get log() { return t('Did exactly what it says? Log as planned. Different weight or reps? Adjust. Warm-ups are listed first and count separately.'); },
  get undo() { return t('Logged. Undo is there for 10 seconds; after that, tap any set in the list to edit it. Back keeps the session running.'); },
  get grade() { return t("Beat means more than planned, hit means exactly it, missed means short. Next time's plan is built from today, so a beat moves you up."); },
  get readiness() { return t("Three quick taps before you start. A bad night or sore legs eases today's targets; skip them and they count as good."); },
  get progress() { return t("Each lift's trend and level. Tap a lift for its chart, its next level and your best weight at each rep count."); },
};
export const goalNudgeText = () => t("Have a target in mind? Set a goal and its date in Profile, and the app will tell you if you're on pace.");
export const GOAL_NUDGE_DAYS = 7;

export const tipNumber = (id: TipId): number => TIP_IDS.indexOf(id) + 1;

/** The one card to show: the lowest-numbered qualifying tip not yet seen, the goal nudge last. */
export function pickTip(qualifying: Partial<Record<CardId, boolean>>, seen: readonly string[] | null): CardId | null {
  if (!seen) return null;
  return ALL_CARDS.find(id => qualifying[id] && !seen.includes(id)) ?? null;
}

/** When the goal nudge's week starts: the first finished session that had a promise (imported and demo history have none). */
export function firstPromisedSession(sessions: { id: string; date: ISODate; sealed: boolean }[], committed: ReadonlySet<string>): ISODate | null {
  let first: ISODate | null = null;
  for (const s of sessions) if (s.sealed && committed.has(s.id) && (first === null || s.date < first)) first = s.date;
  return first;
}

export function goalNudgeDue(firstFinished: ISODate | null, today: ISODate, hasTarget: boolean): boolean {
  return !!firstFinished && !hasTarget && daysBetween(firstFinished, today) >= GOAL_NUDGE_DAYS;
}

export async function getTipsSeen(db: GymDb): Promise<string[] | null> {
  const v = await getMeta(db, 'tipsSeen');
  return Array.isArray(v) ? v : null;
}

export async function markTipSeen(db: GymDb, id: CardId): Promise<void> {
  const seen = (await getTipsSeen(db)) ?? [];
  if (!seen.includes(id)) await setMeta(db, 'tipsSeen', [...seen, id]);
}

export async function resetTips(db: GymDb): Promise<void> {
  await setMeta(db, 'tipsSeen', []);
}

/** A log that isn't demo data means someone who already uses the app. */
async function returningUser(db: GymDb): Promise<boolean> {
  return (await db.sessions.count()) > 0 && (await getMeta(db, 'demoMode')) !== true;
}

/** Startup, once: an existing log marks every tip seen; a new install or the demo starts with none seen. */
export async function initTips(db: GymDb): Promise<void> {
  if ((await getTipsSeen(db)) !== null) return;
  await setMeta(db, 'tipsSeen', (await returningUser(db)) ? ALL_CARDS : []);
}

/** After restoring a backup: a restored log means a returning user, whatever the backup's own list says. */
export async function suppressTipsIfReturning(db: GymDb): Promise<void> {
  if (await returningUser(db)) await setMeta(db, 'tipsSeen', ALL_CARDS);
  else if ((await getTipsSeen(db)) === null) await setMeta(db, 'tipsSeen', []);
}
