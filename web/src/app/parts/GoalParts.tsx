// Goals, targets and checkpoints editors over a Profile draft. Used by Profile and Onboarding.
import { useState } from 'react';
import type { Exercise, GoalKind, GoalTarget, ISODate, Profile, TargetType } from '../../domain/types';
import { newId } from '../../db';
import { DateField, Errors, Segmented } from '../../ui/common';
import { formatDate, todayISO } from '../dates';
import {
  GOALS, GOAL_LABELS, SUBJECT_BODYWEIGHT, SUBJECT_SESSIONS, TARGET_TYPE_LABELS, subjectLabel, subjectUnit,
} from '../labels';
import { validateTarget, type TargetDraft } from '../validate';

type Edit = (p: Profile) => void;

export function GoalsEditor({ profile, onChange }: { profile: Profile; onChange: Edit }) {
  const toggle = (g: GoalKind) => {
    const has = profile.goals.includes(g);
    if (has && profile.goals.length === 1) return; // keep at least one
    const goals = has ? profile.goals.filter(x => x !== g) : [...profile.goals, g];
    const ordered = GOALS.filter(x => goals.includes(x));
    onChange({ ...profile, goals: ordered, primaryGoal: ordered.includes(profile.primaryGoal) ? profile.primaryGoal : ordered[0] });
  };
  return (
    <div className="stack">
      <span className="label">Goals</span>
      <div className="chips">
        {GOALS.map(g => (
          <button key={g} type="button" aria-pressed={profile.goals.includes(g)} className={`chip big${profile.goals.includes(g) ? ' on' : ''}`} onClick={() => toggle(g)}>
            {GOAL_LABELS[g]}
          </button>
        ))}
      </div>
      {profile.goals.length > 1 && (
        <Segmented label="Primary goal" value={profile.primaryGoal} onChange={v => onChange({ ...profile, primaryGoal: v })}
          options={profile.goals.map(g => ({ value: g, label: GOAL_LABELS[g] }))} />
      )}
      <p className="mid">The primary goal sets the default prescription for each lift. Other goals add their targets to the goal board.</p>
    </div>
  );
}

const blankDraft = (): TargetDraft => ({ subject: '', value: '', type: 'reach', deadline: '' });

export function TargetsEditor({ profile, onChange, exercises }: { profile: Profile; onChange: Edit; exercises: Exercise[] }) {
  const [draft, setDraft] = useState<TargetDraft>(blankDraft);
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
    <div className="stack">
      <span className="label">Targets and timeline</span>
      {profile.targets.length === 0 && <p className="mid">No targets yet.</p>}
      {profile.targets.map(t => (
        <div key={t.id} className="card tick list-row">
          <div className="stack tight">
            <span className="heading">{subjectLabel(t.subject, names)}</span>
            <span className="mid">{TARGET_TYPE_LABELS[t.type]} <span className="mono num-sm">{t.value} {subjectUnit(t.subject)}</span> by <span className="mono num-sm">{formatDate(t.deadline, { weekday: false })}</span></span>
            {/* TODO(engine): needed pace vs recent pace, feasibility read, benchmark percentile (spec §3.7). */}
            <span className="ghost">Pace and feasibility: from the coach engine (coming).</span>
          </div>
          <button type="button" className="btn" onClick={() => onChange({ ...profile, targets: profile.targets.filter(x => x.id !== t.id) })}>Remove</button>
        </div>
      ))}
      <div className="card stack">
        <span className="label">Add a target</span>
        <label className="stack">
          <span className="label">For</span>
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
        <label className="stack">
          <span className="label">Value ({draft.subject ? subjectUnit(draft.subject) : 'kg'})</span>
          <input className="field mono" inputMode="decimal" value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} />
        </label>
        <DateField label="Deadline" value={draft.deadline} min={today} onChange={v => setDraft({ ...draft, deadline: v })} />
        <Errors errors={errors} />
        <button type="button" className="btn" onClick={add}>Add target</button>
      </div>
    </div>
  );
}

export function CheckpointsEditor({ profile, onChange }: { profile: Profile; onChange: Edit }) {
  const [d, setD] = useState<ISODate | ''>('');
  return (
    <div className="stack">
      <span className="label">Checkpoints</span>
      <p className="mid">Dates that show up on Today and on the goal board.</p>
      {profile.checkpoints.map(c => (
        <div key={c} className="spread list-line">
          <span className="mono num-sm">{formatDate(c)}</span>
          <button type="button" className="btn" onClick={() => onChange({ ...profile, checkpoints: profile.checkpoints.filter(x => x !== c) })}>Remove</button>
        </div>
      ))}
      <div className="row">
        <div className="grow"><DateField label="Add checkpoint" value={d} onChange={setD} /></div>
        <button type="button" className="btn end" disabled={!d || profile.checkpoints.includes(d)} onClick={() => {
          if (!d) return;
          onChange({ ...profile, checkpoints: [...profile.checkpoints, d].sort() });
          setD('');
        }}>Add</button>
      </div>
    </div>
  );
}
