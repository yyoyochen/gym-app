import { describe, expect, it } from 'vitest';
import { freshDb } from '../db/test-helpers';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getMeta, setMeta, startSession } from '../db';
import { loadDemo } from './demo';
import {
  TIP_IDS, TIP_TEXT, firstPromisedSession, getTipsSeen, goalNudgeDue, initTips, markTipSeen, pickTip, resetTips, suppressTipsIfReturning, tipNumber,
} from './tips';

const ALL = [...TIP_IDS, 'goalNudge'];
const aSession = (db: ReturnType<typeof freshDb>) =>
  startSession(db, { programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-20', now: 1 });

describe('which tip shows', () => {
  it('pickTip returns the lowest unseen tip, nudge last', () => {
    expect(pickTip({ promise: true, readiness: true }, [])).toBe('promise');
    expect(pickTip({ promise: true, readiness: true }, ['promise'])).toBe('readiness');
    expect(pickTip({ log: true, undo: true }, [])).toBe('log');
    expect(pickTip({ readiness: true, goalNudge: true }, [])).toBe('readiness');
    expect(pickTip({ goalNudge: true }, [])).toBe('goalNudge');
    expect(pickTip({ goalNudge: true }, ['goalNudge'])).toBeNull();
    expect(pickTip({ promise: false }, [])).toBeNull();
  });
  it('pickTip shows nothing before tips are initialised', () => {
    expect(pickTip({ promise: true }, null)).toBeNull();
  });
  it('numbers follow the table', () => {
    expect(tipNumber('promise')).toBe(1);
    expect(tipNumber('progress')).toBe(6);
    expect(TIP_IDS).toHaveLength(6);
    expect(TIP_TEXT.promise).toBe("This is today's promise: the numbers to hit, with the reason under them. It locks when you start, and the session is graded against it.");
    for (const id of TIP_IDS) expect(TIP_TEXT[id]).not.toMatch(/commit/i);
  });
  it('goal nudge: 7 days after the first finished session, never with a target', () => {
    expect(goalNudgeDue('2026-11-01', '2026-11-07', false)).toBe(false);
    expect(goalNudgeDue('2026-11-01', '2026-11-08', false)).toBe(true);
    expect(goalNudgeDue('2026-11-01', '2026-11-20', true)).toBe(false);
    expect(goalNudgeDue(null, '2026-11-20', false)).toBe(false);
  });
});

describe('tips storage', () => {
  it('initTips: new install gets an empty list', async () => {
    const db = freshDb();
    expect(await getTipsSeen(db)).toBeNull();
    await initTips(db);
    expect(await getTipsSeen(db)).toEqual([]);
  });
  it('initTips: an existing log marks every tip seen', async () => {
    const db = freshDb();
    await aSession(db);
    await initTips(db);
    expect(await getTipsSeen(db)).toEqual(ALL);
  });
  it('initTips: demo data still sees tips', async () => {
    const db = freshDb();
    await aSession(db);
    await setMeta(db, 'demoMode', true);
    await initTips(db);
    expect(await getTipsSeen(db)).toEqual([]);
  });
  it('initTips runs once: a later call keeps the list', async () => {
    const db = freshDb();
    await setMeta(db, 'tipsSeen', ['promise']);
    await aSession(db);
    await initTips(db);
    expect(await getTipsSeen(db)).toEqual(['promise']);
  });
  it('suppressTipsIfReturning marks all seen when a logged session exists', async () => {
    const db = freshDb();
    await setMeta(db, 'tipsSeen', []);
    await suppressTipsIfReturning(db);
    expect(await getTipsSeen(db)).toEqual([]);
    await aSession(db);
    await suppressTipsIfReturning(db);
    expect(await getTipsSeen(db)).toEqual(ALL);
  });
  it('markTipSeen adds once; resetTips clears', async () => {
    const db = freshDb();
    await markTipSeen(db, 'log');
    await markTipSeen(db, 'log');
    expect(await getMeta(db, 'tipsSeen')).toEqual(['log']);
    await resetTips(db);
    expect(await getTipsSeen(db)).toEqual([]);
  });
  it('loading the demo from setup leaves the tips on (the wipe clears meta)', async () => {
    const db = freshDb();
    await initTips(db);
    const csv = readFileSync(fileURLToPath(new URL('../import/__fixtures__/sample-notion.csv', import.meta.url)), 'utf8');
    await loadDemo(db, Date.now(), csv);
    expect(await getTipsSeen(db)).toEqual([]);
  });
  it('a restore with no log and no list starts the tips', async () => {
    const db = freshDb();
    await suppressTipsIfReturning(db);
    expect(await getTipsSeen(db)).toEqual([]);
  });
});

describe('goal nudge clock', () => {
  it('starts at the first finished session that had a promise, not imported or demo history', () => {
    const s = (id: string, date: string, sealed = true) => ({ id, date, sealed });
    const sessions = [s('imp1', '2026-01-01'), s('imp2', '2026-02-01'), s('open', '2026-11-19', false), s('real', '2026-11-20'), s('real2', '2026-11-21')];
    expect(firstPromisedSession(sessions, new Set(['open', 'real', 'real2']))).toBe('2026-11-20');
    expect(firstPromisedSession(sessions, new Set())).toBeNull();
  });
});
