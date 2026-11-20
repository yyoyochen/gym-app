import { describe, it, expect } from 'vitest';
import { defaultCatalog, findInCatalog, guessExercise, exerciseIdFor, nameKey, EX } from './catalog';
import { allTemplates, programFromTemplate, TEMPLATES, RIR_FLOOR } from './templates';

describe('default catalog', () => {
  const cat = defaultCatalog();
  const byId = new Map(cat.map(e => [e.id, e]));

  it('has unique ids and names, and no alias shared between entries', () => {
    expect(new Set(cat.map(e => e.id)).size).toBe(cat.length);
    const owner = new Map<string, string>();
    for (const e of cat) for (const k of [e.name, ...e.aliases].map(nameKey)) {
      expect(owner.get(k) ?? e.id, k).toBe(e.id);
      owner.set(k, e.id);
    }
    for (const e of cat) expect(e.id).toBe(exerciseIdFor(e.name));
  });

  it('main lifts: benchmark keys, areas loaded, increments', () => {
    expect(byId.get(EX.squat)).toMatchObject({ name: 'Back Squat', benchmarkKey: 'squat', increment: 5, slotType: 'compound', areasLoaded: ['knee', 'hip', 'lower_back'] });
    expect(byId.get(EX.bench)).toMatchObject({ name: 'Barbell Bench Press', benchmarkKey: 'bench', increment: 2.5, areasLoaded: ['shoulder', 'elbow', 'wrist'] });
    expect(byId.get(EX.deadlift)).toMatchObject({ name: 'Conventional Deadlift', benchmarkKey: 'deadlift', increment: 5 });
    expect(byId.get(EX.ohp)).toMatchObject({ benchmarkKey: null, increment: 2.5 });
    expect(cat.filter(e => e.benchmarkKey).map(e => e.id).sort()).toEqual([EX.bench, EX.squat, EX.deadlift].sort());
  });

  it('bodyweight factors: dips/pull-ups/chin-ups 0.95, push-up 0.7, everything else 0', () => {
    const bw = Object.fromEntries(cat.filter(e => e.bodyweightFactor).map(e => [e.id, e.bodyweightFactor]));
    expect(bw).toEqual({ dips: 0.95, 'pull-up': 0.95, 'chin-up': 0.95, 'push-up': 0.7 });
  });

  it('DB/cable isolation increments are 1 kg', () => {
    for (const id of ['db-lateral-raise', 'cable-lateral-raise', 'db-curl', 'cable-tricep-pushdown', 'preacher-curl']) {
      expect(byId.get(id)?.increment).toBe(1);
    }
  });

  it('findInCatalog matches names and aliases loosely', () => {
    expect(findInCatalog('ohp')?.id).toBe(EX.ohp);
    expect(findInCatalog('Pull-ups')?.id).toBe('pull-up');
    expect(findInCatalog('bench press')?.id).toBe(EX.bench);
    expect(findInCatalog('Zercher Squat')).toBeUndefined();
  });
});

describe('guessExercise (keyword defaults)', () => {
  it.each([
    ['Zercher Squat', { slotType: 'compound', increment: 5, areasLoaded: ['knee', 'hip'] }],
    ['Snatch-Grip Deadlift', { slotType: 'compound', increment: 5, areasLoaded: ['lower_back', 'hip'] }],
    ['Cable Y Raise', { slotType: 'isolation', increment: 1 }],
    ['EZ Bar Spider Curl', { slotType: 'isolation', increment: 2.5, areasLoaded: ['elbow', 'wrist'] }],
    ['Machine Leg Curl', { slotType: 'isolation', increment: 1, areasLoaded: ['knee'] }],
    ['Rope Tricep Pulldown', { slotType: 'isolation', areasLoaded: ['elbow'] }],
    ['Weighted Chin-ups', { slotType: 'compound', bodyweightFactor: 0.95 }],
    ['Ring Dip', { bodyweightFactor: 0.95 }],
    ['Deficit Push-ups', { bodyweightFactor: 0.7 }],
    ['Floor Press', { slotType: 'compound', increment: 2.5, areasLoaded: ['shoulder', 'elbow', 'wrist'] }],
    ['Seal Row', { slotType: 'compound', areasLoaded: ['shoulder', 'elbow', 'upper_back'] }],
    ['Dead Bug Hold', { slotType: 'isolation' }],
    ['Something Odd', { slotType: 'compound', increment: 2.5, areasLoaded: [], benchmarkKey: null }],
  ])('%s', (name, want) => {
    const e = guessExercise(name);
    expect(e).toMatchObject({ name, id: exerciseIdFor(name), ...want });
  });

  it('returns the catalog entry for a known name', () => {
    expect(guessExercise('Squat').id).toBe(EX.squat);
  });
});

describe('templates', () => {
  const ids = new Set(defaultCatalog().map(e => e.id));

  it('the four templates of §3.8, Full body A/B/C first', () => {
    expect(TEMPLATES.map(t => t.id)).toEqual(['fullbody-abc', 'upper-lower', 'linear-5x5', 'hypertrophy-split']);
    expect(programFromTemplate().rotation).toEqual(['A', 'B', 'C']);
    expect(() => programFromTemplate('nope')).toThrow();
  });

  it('every slot points at a catalog exercise; slot ids unique; rotation and minimum ids valid', () => {
    for (const p of allTemplates()) {
      const slotIds = p.sessions.flatMap(s => s.slots.map(x => x.id));
      expect(new Set(slotIds).size).toBe(slotIds.length);
      expect(p.rotation.every(k => p.sessions.some(s => s.key === k))).toBe(true);
      for (const s of p.sessions) {
        for (const x of s.slots) expect(ids.has(x.exerciseId), `${p.id}/${x.exerciseId}`).toBe(true);
        for (const m of s.minimumSlotIds) expect(s.slots.some(x => x.id === m)).toBe(true);
      }
    }
  });

  it('effort floors: top sets 2, compound working 2, isolation 1; no weights anywhere', () => {
    const cat = new Map(defaultCatalog().map(e => [e.id, e]));
    for (const p of allTemplates()) for (const s of p.sessions) for (const x of s.slots) {
      const iso = cat.get(x.exerciseId)!.slotType === 'isolation';
      const want = x.model === 'topset' ? RIR_FLOOR.top : iso ? RIR_FLOOR.isolation : RIR_FLOOR.compound;
      expect(x.params.rirFloor, `${p.id}/${x.id}`).toBe(want);
      expect(JSON.stringify(x)).not.toMatch(/"weight"/);
      expect(x.params.repMin).toBeLessThanOrEqual(x.params.repMax);
    }
  });

  it('Full body: A = squat+bench, B = deadlift+OHP top sets; C double progression only', () => {
    const p = programFromTemplate('fullbody-abc');
    const [a, b, c] = p.sessions;
    expect(a.slots.slice(0, 2).map(x => [x.exerciseId, x.model])).toEqual([[EX.squat, 'topset'], [EX.bench, 'topset']]);
    expect(b.slots.slice(0, 2).map(x => [x.exerciseId, x.model])).toEqual([[EX.deadlift, 'topset'], [EX.ohp, 'topset']]);
    expect(c.slots.every(x => x.model === 'double')).toBe(true);
    expect(a.slots[0].params).toMatchObject({ topReps: 2, backoffSets: 3, backoffPct: 75, repMin: 8, repMax: 10 });
  });

  it('5×5 uses linear5x5 everywhere; hypertrophy split uses double everywhere', () => {
    expect(programFromTemplate('linear-5x5').sessions.flatMap(s => s.slots).every(x => x.model === 'linear5x5')).toBe(true);
    expect(programFromTemplate('hypertrophy-split').sessions.flatMap(s => s.slots).every(x => x.model === 'double')).toBe(true);
  });

  it('returns fresh copies', () => {
    const a = programFromTemplate();
    a.sessions[0].slots[0].params.sets = 99;
    expect(programFromTemplate().sessions[0].slots[0].params.sets).toBe(1);
  });
});
