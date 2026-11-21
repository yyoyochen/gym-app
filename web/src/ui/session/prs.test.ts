import { describe, expect, it } from 'vitest';
import type { SetEntry } from '../../domain/types';
import { priorFromHistory, prMomentFor, sessionPrs, type PriorSet } from './prs';

const p = (weight: number, reps: number, date = '2026-11-10', kind: PriorSet['kind'] = 'top'): PriorSet => ({ weight, reps, kind, date });
let n = 0;
const set = (weight: number, reps: number, kind: SetEntry['kind'] = 'top', exerciseId = 'squat'): SetEntry => ({
  id: `s${++n}`, sessionId: 'today', exerciseId, exerciseNameSnapshot: exerciseId === 'squat' ? 'Back squat' : 'Bench', slotOrder: 1, setOrder: n,
  kind, weight, reps, loggedAt: 1000 + n,
});

describe('PR moment wiring', () => {
  // Synthetic numbers (not from any real log).
  const prior = [p(80, 3, '2026-03-02'), p(87.5, 3, '2026-03-09'), p(60, 6, '2026-03-09', 'backoff')];

  it('a heavier set opens the moment with the previous best and the e1RM change', () => {
    expect(prMomentFor({ weight: 92.5, reps: 3, kind: 'top' }, prior, 'Back squat')).toEqual({
      value: '92.5', unit: 'kg × 3', caption: 'heaviest set yet', lift: 'Back squat',
      pairs: [{ label: 'Previous best', value: '87.5 × 3, 9 Mar' }, { label: 'e1RM', value: '96.3 → 101.8' }],
    });
  });

  it('more reps at a known weight is an e1RM best', () => {
    const m = prMomentFor({ weight: 87.5, reps: 4, kind: 'top' }, prior, 'Back squat');
    expect(m?.caption).toBe('best e1RM yet');
    expect(m?.pairs?.[0].value).toBe('87.5 × 3, 9 Mar');
  });

  it('no moment for warm-ups, matches, or a first-ever log', () => {
    expect(prMomentFor({ weight: 140, reps: 1, kind: 'warmup' }, prior, 'x')).toBeNull();
    expect(prMomentFor({ weight: 87.5, reps: 3, kind: 'top' }, prior, 'x')).toBeNull();
    expect(prMomentFor({ weight: 60, reps: 5, kind: 'working' }, [], 'x')).toBeNull();
  });

  it('history excludes the set just logged, so it can be compared with itself', () => {
    const s = set(95, 1);
    const days = [{ session: { date: '2026-03-16' }, sets: [s] }, { session: { date: '2026-03-09' }, sets: [set(87.5, 3)] }];
    const flat = priorFromHistory(days, s.id);
    expect(flat).toHaveLength(1);
    expect(prMomentFor(s, flat, 'Back squat')?.value).toBe('95');
    expect(prMomentFor(s, priorFromHistory(days), 'Back squat')).toBeNull();
  });

  it('a session keeps the biggest new best per lift, replaying sets in order', () => {
    const sets = [set(50, 5, 'warmup'), set(92.5, 3), set(95, 3), set(60, 6, 'backoff'), set(70, 5, 'working', 'bench')];
    const prs = sessionPrs(sets, '2026-03-16', id => (id === 'squat' ? prior : [p(70, 5, '2026-03-02', 'working')]));
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ exerciseId: 'squat', lift: 'Back squat', moment: { value: '95', unit: 'kg × 3' } });
  });
});
