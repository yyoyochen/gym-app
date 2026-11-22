// Goals, targets and checkpoints editors over a Profile draft. Used by
// Profile (inside kit Sheets) and Onboarding. Read views of targets live in
// Profile; these are the editing bits.
import { useState } from 'react';
import type { Exercise, GoalKind, GoalTarget, ISODate, Profile, TargetType } from '../../domain/types';
import { newId } from '../../db';
import { DateField, Errors, Segmented } from '../../ui/common';
import { DitherBar, PixelIcon, Toggle, ValueRow } from '../../ui/kit';
import { formatDate, todayISO } from '../dates';
import {
  GOALS, GOAL_LABELS, SUBJECT_BODYWEIGHT, SUBJECT_SESSIONS, TARGET_TYPE_LABELS, subjectLabel, subjectUnit,
} from '../labels';
import { validateTarget, type TargetDraft } from '../validate';
import { rateTarget, type RateContext } from '../../benchmarks/liftRating';
import type { GymStandardsData } from '../../benchmarks/gymStandards';
import { levelWord, ordinal, standardsContext, useGymStandards } from '../../ui/progress/standards';

type Edit = (p: Profile) => void;

/** Short goal words for the Segmented (the full labels overflow four segments). */
export const GOAL_SHORT: Record<GoalKind, string> = { strength: 'Strength', maintain: 'Maintain', hypertrophy: 'Size', bodycomp: 'Body comp' };

export function GoalsEditor({ profile, onChange }: { profile: Profile; onChange: Edit }) {
  const toggle = (g: GoalKind) => {
    const has = profile.goals.includes(g);
    if (has && profile.goals.length === 1) return; // keep at least one
    const goals = has ? profile.goals.filter(x => x !== g) : [...profile.goals, g];
    const ordered = GOALS.filter(x => goals.includes(x));
    onChange({ ...profile, goals: ordered, primaryGoal: ordered.includes(profile.primaryGoal) ? profile.primaryGoal : ordered[0] });
  };
  return (
    <div className="form-group">
      <div className="toggle-list">
        {GOALS.map(g => (
          <Toggle key={g} label={GOAL_LABELS[g]} checked={profile.goals.includes(g)} onChange={() => toggle(g)}
            disabled={profile.goals.length === 1 && profile.goals[0] === g} />
        ))}
      </div>
      {profile.goals.length > 1 && (
        <Segmented label="Primary goal" value={profile.primaryGoal} onChange={v => onChange({ ...profile, primaryGoal: v })}
          options={profile.goals.map(g => ({ value: g, label: GOAL_SHORT[g] }))} />
      )}
      <p className="quiet">The primary goal sets the default prescription for each lift. Other goals add their targets to the goal board.</p>
    </div>
  );
}

const blankDraft = (): TargetDraft => ({ subject: '', value: '', type: 'reach', deadline: '' });

/** The level a lift target sits at on the gym-goer standards, as a dither bar. */
export function TargetLevelBar({ gym, ctx, ex, value }: { gym: GymStandardsData | null | undefined; ctx: RateContext | null; ex?: Exercise; value: number }) {
  if (!gym || !ctx || !ex || !(value > 0)) return null;
  const r = rateTarget(gym, ex, value, ctx);
  if (!r) return null;
  const text = `${levelWord(r)} · ${ordinal(r.percentile)}`;
  return <DitherBar label={r.basis === 'weighted' ? 'Level at target · added load' : 'Level at target'} valueText={text} value={r.percentile / 100}
    ariaLabel={`Level at target: ${levelWord(r)}, ${ordinal(r.percentile)} percentile of gym-goers`} />;
}

/** "Hold 120 kg by 31 Dec" */
export function targetLine(t: GoalTarget): string {
  return `${TARGET_TYPE_LABELS[t.type]} ${t.value} ${subjectUnit(t.subject)} by ${formatDate(t.deadline, { weekday: false })}`;
}

export function TargetsEditor({ profile, onChange, exercises, bodyweightKg }: { profile: Profile; onChange: Edit; exercises: Exercise[]; bodyweightKg?: number }) {
  const [draft, setDraft] = useState<TargetDraft>(blankDraft);
  const gym = useGymStandards();
  const ctx = standardsContext({ profile, bodyweightKg, year: new Date().getFullYear() });
  const byId = new Map(exercises.map(e => [e.id, e]));
  const [errors, setErrors] = useState<string[]>([]);
  const names = new Map(exercises.map(e => [e.id, e.name]));
  const main = exercises.filter(e => e.benchmarkKey || e.id === 'overhead-press');
  const rest = exercises.filter(e => !main.includes(e));
  const today = todayISO();

  const add = () => {
    const v = validateTarget(draft, today);
    setErrors(v.errors);
    if (v.errors.length || v.value === undefined) return;
    const t: GoalTarget = { id: newId('tgt'), subject: draft.subject, value: v.value, type: draft.type, deadline: draft.deadline };
    onChange({ ...profile, targets: [...profile.targets, t] });
    setDraft(blankDraft());
  };

  return (
    <div className="form-group">
      {profile.targets.length > 0 && (
        <div className="sheetblk">
          <div className="sheetblk-hd"><span>Targets</span><span>{profile.targets.length}</span></div>
          {profile.targets.map((t, i) => (
            <ValueRow key={t.id} k={String(i + 1).padStart(2, '0')} value={subjectLabel(t.subject, names)} sub={targetLine(t)}>
              <button type="button" className="icon-btn" aria-label={`Remove ${subjectLabel(t.subject, names)} target`} data-press="dim"
                onClick={() => onChange({ ...profile, targets: profile.targets.filter(x => x.id !== t.id) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <div className="form-group">
        <label className="field-wrap">
          <span className="label">{profile.targets.length ? 'Another target for' : 'Target for'}</span>
          <select className="field" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}>
            <option value="">Choose…</option>
            <optgroup label="Main lifts">{main.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
            <optgroup label="Other">
              <option value={SUBJECT_BODYWEIGHT}>Bodyweight</option>
              <option value={SUBJECT_SESSIONS}>Sessions per week</option>
            </optgroup>
            <optgroup label="All exercises">{rest.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>
          </select>
        </label>
        <Segmented<TargetType> label="Type" value={draft.type} onChange={v => setDraft({ ...draft, type: v })}
          options={(['reach', 'hold', 'at_least'] as TargetType[]).map(v => ({ value: v, label: TARGET_TYPE_LABELS[v] }))} />
        <div className="grid2">
          <label className="field-wrap">
            <span className="label">Value · {draft.subject ? subjectUnit(draft.subject) : 'kg'}</span>
            <input className="field tnum" inputMode="decimal" value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} />
          </label>
          <DateField label="Deadline" value={draft.deadline} min={today} onChange={v => setDraft({ ...draft, deadline: v })} />
        </div>
        <TargetLevelBar gym={gym} ctx={ctx} ex={byId.get(draft.subject)} value={Number(draft.value)} />
        <Errors errors={errors} />
        <button type="button" className="btn block split" onClick={add}><span>Add target</span><PixelIcon name="plus" /></button>
      </div>
    </div>
  );
}

export function CheckpointsEditor({ profile, onChange }: { profile: Profile; onChange: Edit }) {
  const [d, setD] = useState<ISODate | ''>('');
  return (
    <div className="form-group">
      <p className="quiet">Dates that show up on Today and on the goal board.</p>
      {profile.checkpoints.length > 0 && (
        <div className="sheetblk">
          {profile.checkpoints.map((c, i) => (
            <ValueRow key={c} k={String(i + 1).padStart(2, '0')} value={formatDate(c)}>
              <button type="button" className="icon-btn" aria-label={`Remove checkpoint ${formatDate(c)}`} data-press="dim"
                onClick={() => onChange({ ...profile, checkpoints: profile.checkpoints.filter(x => x !== c) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <div className="row end-row">
        <div className="grow"><DateField label="Add checkpoint" value={d} onChange={setD} /></div>
        <button type="button" className="btn" disabled={!d || profile.checkpoints.includes(d)} onClick={() => {
          if (!d) return;
          onChange({ ...profile, checkpoints: [...profile.checkpoints, d].sort() });
          setD('');
        }}>Add</button>
      </div>
    </div>
  );
}
