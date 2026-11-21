import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addDays, daysBetween, formatDate, monthGrid, shiftMonth, weekday } from './dates';
import { shiftCsvDates, loadDemo, DEMO_GAP_DAYS } from './demo';
import { needsOnboarding } from './firstRun';
import { parseNum, validateProfile, validateTarget, validateSlotParams, validatePhase } from './validate';
import {
  addSession, addSlot, changeModel, deleteSession, describeSlot, moveSession, moveSlot, removeSlot,
  setInRotation, swapExercise, toggleMinimum, nextSessionKey,
} from './program';
import { formatRir, rirToScale, scaleToRir } from './effort';
import { freshDb } from '../db/test-helpers';
import { getMeta, getProfile, getActiveProgram, listSessions, defaultProfile, saveProfile } from '../db';
import { programFromTemplate } from '../domain/templates';
import { defaultCatalog } from '../domain/catalog';
import { parseNotionCsv } from '../import/notion';

const FIXTURE = fileURLToPath(new URL('../../../tools/synthetic/fixtures/demo-log.csv', import.meta.url));

describe('dates', () => {
  it('adds days across month/year/leap boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2025-01-06', '2026-11-19')).toBe(682);
  });
  it('weekday, formatting and month grid', () => {
    expect(weekday('2026-11-21')).toBe(6); // Saturday
    expect(formatDate('2026-11-21')).toBe('Sat 21 Nov 2026');
    const g = monthGrid(2026, 11); // Nov 2026 starts on a Sunday
    expect(g[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(g[0][6]).toBe('2026-11-01');
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every(w => w.length === 7)).toBe(true);
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});

describe('demo date shift', () => {
  const csv = readFileSync(fileURLToPath(new URL('./__fixtures__/shift-sample.csv', import.meta.url)), 'utf8');
  it('moves the last date to the target and keeps gaps', () => {
    const r = shiftCsvDates(csv, '2026-11-19');
    const rows = parseNotionCsv(r.csv).rows;
    expect(rows.map(x => x.date)).toEqual(['2026-11-19', addDays('2026-11-19', -270)]);
    expect(r.shiftDays).toBe(daysBetween('2025-10-03', '2026-11-19'));
    expect(rows[0].notes).toBe('felt ok, slow');
    expect(r.firstDate).toBe(addDays('2026-11-19', -270));
  });
  it('can shift backwards too and leaves unreadable dates alone', () => {
    const r = shiftCsvDates(csv + 'someday,A,Squat,1,1,5,100,\n', '2025-10-01');
    expect(r.shiftDays).toBe(-2);
    expect(parseNotionCsv(r.csv).skipped).toHaveLength(1);
  });
  it('loadDemo imports the fixture ending 2 days before today, with profile, program and demoMode', async () => {
    const db = freshDb();
    const now = Date.UTC(2026, 10, 21, 12);
    const r = await loadDemo(db, now, readFileSync(FIXTURE, 'utf8'));
    expect(r.sessionsAdded).toBeGreaterThan(50);
    const sessions = await listSessions(db);
    const last = sessions[sessions.length - 1].date;
    expect(daysBetween(last, '2026-11-21')).toBe(DEMO_GAP_DAYS);
    expect(await getMeta(db, 'demoMode')).toBe(true);
    expect((await getProfile(db))?.sex).toBe('M');
    expect((await getActiveProgram(db))?.id).toBe('fullbody-abc');
    expect(await needsOnboarding(db)).toBe(false);
  });
});

describe('first run', () => {
  it('needs onboarding only with no profile and no sessions', async () => {
    const db = freshDb();
    expect(await needsOnboarding(db)).toBe(true);
    await saveProfile(db, defaultProfile());
    expect(await needsOnboarding(db)).toBe(false);
  });
});

describe('validation', () => {
  it('parses numbers with commas, blanks and bounds', () => {
    expect(parseNum('82,5')).toEqual({ ok: true, value: 82.5 });
    expect(parseNum('')).toEqual({ ok: true, value: undefined });
    expect(parseNum('', { required: true }).ok).toBe(false);
    expect(parseNum('3.5', { integer: true }).ok).toBe(false);
    expect(parseNum('abc').ok).toBe(false);
    expect(parseNum('9', { min: 10 }).ok).toBe(false);
  });
  it('profile rules', () => {
    const p = defaultProfile();
    expect(validateProfile(p, 2026)).toEqual([]);
    expect(validateProfile({ ...p, sessionsPerWeekMin: 4 }, 2026)[0]).toMatch(/above the target/);
    expect(validateProfile({ ...p, birthYear: 2020 }, 2026)[0]).toMatch(/Birth year/);
    expect(validateProfile({ ...p, primaryGoal: 'strength' }, 2026)[0]).toMatch(/primary goal/);
  });
  it('target rules', () => {
    const ok = validateTarget({ subject: 'back-squat', value: '140', type: 'reach', deadline: '2027-03-01' }, '2026-11-21');
    expect(ok).toEqual({ errors: [], value: 140 });
    const bad = validateTarget({ subject: 'sessions_per_week', value: '2.5', type: 'at_least', deadline: '2026-11-21' }, '2026-11-21');
    expect(bad.errors).toHaveLength(2);
    expect(validateTarget({ subject: '', value: '', type: 'reach', deadline: '' }, '2026-11-21').errors).toHaveLength(3);
  });
  it('slot params rules, incl. backoffPct as a percentage', () => {
    const top = programFromTemplate().sessions[0].slots[0];
    expect(validateSlotParams('topset', top.params)).toEqual([]);
    expect(validateSlotParams('topset', { ...top.params, backoffPct: 0.85 })[0]).toMatch(/85 = 85%/);
    expect(validateSlotParams('double', { sets: 3, repMin: 12, repMax: 8, rirFloor: 2 })[0]).toMatch(/low end/);
  });
  it('phase rules', () => {
    const a = { name: 'Re-entry', start: '2026-12-01', end: '2026-12-14' };
    const b = { name: 'Block', start: '2026-12-10', end: '2027-01-10' };
    expect(validatePhase(a, [a])).toEqual([]);
    expect(validatePhase(b, [a, b])[0]).toMatch(/Overlaps/);
    expect(validatePhase({ ...a, end: '2026-11-01' })[0]).toMatch(/ends before/);
  });
});

describe('program edits', () => {
  const squat = defaultCatalog().find(e => e.id === 'back-squat')!;
  const curl = defaultCatalog().find(e => e.slotType === 'isolation')!;
  it('sessions: add, reorder (rotation follows), drop from rotation, delete', () => {
    let p = programFromTemplate();
    expect(nextSessionKey(p)).toBe('D');
    p = addSession(p, 'Extra');
    expect(p.rotation).toEqual(['A', 'B', 'C', 'D']);
    p = moveSession(p, 'D', -1);
    expect(p.sessions.map(s => s.key)).toEqual(['A', 'B', 'D', 'C']);
    expect(p.rotation).toEqual(['A', 'B', 'D', 'C']);
    p = setInRotation(p, 'D', false);
    expect(p.rotation).toEqual(['A', 'B', 'C']);
    p = setInRotation(p, 'D', true);
    expect(p.rotation).toEqual(['A', 'B', 'D', 'C']);
    p = deleteSession(p, 'D');
    expect(p.rotation).toEqual(['A', 'B', 'C']);
  });
  it('slots: add with defaults, swap keeps model+params, reorder, minimum, remove', () => {
    let p = programFromTemplate();
    const first = p.sessions[0].slots[0];
    p = swapExercise(p, 'A', first.id, 'front-squat');
    const swapped = p.sessions[0].slots[0];
    expect(swapped).toEqual({ ...first, exerciseId: 'front-squat' });
    p = addSlot(p, 'A', curl, 'x1');
    const added = p.sessions[0].slots.at(-1)!;
    expect(added.params.rirFloor).toBe(1);
    p = moveSlot(p, 'A', 'x1', -1);
    expect(p.sessions[0].slots.at(-2)!.id).toBe('x1');
    p = toggleMinimum(p, 'A', 'x1');
    expect(p.sessions[0].minimumSlotIds).toContain('x1');
    p = removeSlot(p, 'A', 'x1');
    expect(p.sessions[0].minimumSlotIds).not.toContain('x1');
    expect(p.sessions[0].slots.some(s => s.id === 'x1')).toBe(false);
    expect(addSlot(p, 'A', squat, 'y').sessions[0].slots.at(-1)!.params.rirFloor).toBe(2);
  });
  it('model change adds/drops top-set fields; describeSlot', () => {
    const top = programFromTemplate().sessions[0].slots[0];
    expect(describeSlot(top)).toBe('top 2 + 3×8–10 @ 75%');
    const dbl = changeModel(top, 'double');
    expect(dbl.params.topReps).toBeUndefined();
    expect(dbl.params.sets).toBe(3);
    expect(describeSlot(dbl)).toBe('3×8–10');
    const back = changeModel(dbl, 'topset');
    expect(back.params).toMatchObject({ sets: 1, topReps: 2, backoffSets: 3, backoffPct: 85 });
    expect(describeSlot(changeModel(dbl, 'linear5x5'))).toBe('5×5');
  });
});

describe('effort display', () => {
  it('shows RIR or RPE', () => {
    expect(formatRir(2, 'rir')).toBe('2 RIR');
    expect(formatRir(1.5, 'rpe')).toBe('RPE 8.5');
    expect(formatRir(undefined, 'rpe')).toBe('');
    expect(scaleToRir(rirToScale(3, 'rpe'), 'rpe')).toBe(3);
  });
});

import { summarizeSession, groupBlocks } from './history';
describe('history summaries', () => {
  const ses = { id: 's', programSessionKey: 'A', nameSnapshot: 'A', date: '2026-11-19', startedAt: 0, sealed: true };
  const mk = (id: string, slotOrder: number, exerciseId: string, weight: number, reps: number, kind: 'working' | 'warmup' = 'working') =>
    ({ id, sessionId: 's', exerciseId, exerciseNameSnapshot: exerciseId, slotOrder, setOrder: 1, kind, weight, reps, loggedAt: 0 });
  it('picks the heaviest non-warm-up set per lift in slot order', () => {
    const sets = [mk('1', 1, 'sq', 140, 1, 'warmup'), mk('2', 1, 'sq', 100, 5), mk('3', 1, 'sq', 100, 6), mk('4', 2, 'bp', 80, 5), mk('5', 3, 'row', 60, 10), mk('6', 4, 'curl', 12, 12)];
    const r = summarizeSession(ses, sets);
    expect(r.setCount).toBe(6);
    expect(r.top.map(t => `${t.exerciseId} ${t.weight}x${t.reps}`)).toEqual(['sq 100x6', 'bp 80x5', 'row 60x10']);
    expect(groupBlocks(sets).map(b => b.sets.length)).toEqual([3, 1, 1, 1]);
  });
  it('groups every set of an exercise into one block, even when slots differ or lifts alternate', () => {
    const sets = [mk('1', 1, 'fs', 60, 8), mk('2', 2, 'fs', 70, 8), mk('3', 3, 'ohp', 40, 8), mk('4', 4, 'fs', 80, 8), mk('5', 5, 'ohp', 40, 8)];
    const g = groupBlocks(sets);
    expect(g.map(b => b.exerciseId)).toEqual(['fs', 'ohp']);
    expect(g[0].sets.map(s => s.weight)).toEqual([60, 70, 80]);
    expect(g[1].sets.map(s => s.id)).toEqual(['3', '5']);
  });
});
