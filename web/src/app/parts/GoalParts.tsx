// Goals, targets and checkpoints editors over a Profile draft. Used by
// Profile (inside kit Sheets) and Onboarding. Read views of targets live in
// Profile; these are the editing bits.
import { useState } from 'react';
import type { Exercise, GoalKind, GoalTarget, ISODate, Profile, TargetType } from '../../domain/types';
import { newId } from '../../db';
import { DateField, Errors, Segmented } from '../../ui/common';
import { Select } from '../../ui/kit';
import { DitherBar, DragList, PixelIcon, Toggle, ValueRow } from '../../ui/kit';
import { formatDate, todayISO } from '../dates';
import {
  GOALS, GOAL_LABELS, SUBJECT_BODYWEIGHT, SUBJECT_SESSIONS, TARGET_TYPE_LABELS, subjectLabel, subjectUnit,
} from '../labels';
import { validateTarget, type TargetDraft } from '../validate';
import { rateTarget, type RateContext } from '../../benchmarks/liftRating';
import type { GymStandardsData } from '../../benchmarks/gymStandards';
import { levelWord, ordinal, standardsContext, standingText, useGymStandards } from '../../ui/progress/standards';
import { t, tn } from '../../i18n';

type Edit = (p: Profile) => void;

/** Short goal words for the Segmented (the full labels overflow four segments). */
export const GOAL_SHORT: Record<GoalKind, string> = {
  get strength() { return t('Strength'); },
  get maintain() { return t('Maintain'); },
  get hypertrophy() { return t('Size'); },
  get bodycomp() { return t('Body comp'); },
};

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
        <Segmented label={t('Primary goal')} value={profile.primaryGoal} onChange={v => onChange({ ...profile, primaryGoal: v })}
          options={profile.goals.map(g => ({ value: g, label: GOAL_SHORT[g] }))} />
      )}
      <p className="quiet">{t('The primary goal sets the default prescription for each lift. Other goals add their targets to the goal board.')}</p>
    </div>
  );
}

const blankDraft = (): TargetDraft => ({ subject: '', value: '', type: 'reach', deadline: '' });

/** The level a lift target sits at on the gym-goer standards, as a dither bar. */
export function TargetLevelBar({ gym, ctx, ex, value }: { gym: GymStandardsData | null | undefined; ctx: RateContext | null; ex?: Exercise; value: number }) {
  if (!gym || !ctx || !ex || !(value > 0)) return null;
  const r = rateTarget(gym, ex, value, ctx);
  if (!r) return null;
  const text = t('{level}, {ordinal}', { level: levelWord(r), ordinal: ordinal(r.percentile) });
  return <DitherBar label={r.basis === 'weighted' ? t('Level at target (added load)') : t('Level at target')} valueText={text} value={r.percentile / 100}
    ariaLabel={t('Level at target: {standing}', { standing: standingText(r) })} />;
}

/** "Hold 120 kg by 31 Dec" */
export function targetLine(tg: GoalTarget): string {
  return t('{type} {value} {unit} by {date}', { type: TARGET_TYPE_LABELS[tg.type], value: tg.value, unit: subjectUnit(tg.subject), date: formatDate(tg.deadline, { weekday: false }) });
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
    const tg: GoalTarget = { id: newId('tgt'), subject: draft.subject, value: v.value, type: draft.type, deadline: draft.deadline };
    onChange({ ...profile, targets: [...profile.targets, tg] });
    setDraft(blankDraft());
  };

  return (
    <div className="form-group">
      {profile.targets.length > 0 && (
        <div className="sheetblk">
          <div className="sheetblk-hd"><span>{t('Targets')}</span><span>{profile.targets.length}</span></div>
          <DragList items={profile.targets} keyOf={tg => tg.id} labelOf={tg => subjectLabel(tg.subject, names)}
            onReorder={targets => onChange({ ...profile, targets })}
            render={(tg, i, grip) => (
              <ValueRow k={String(i + 1)} value={subjectLabel(tg.subject, names)} sub={targetLine(tg)}>
                <span className="row-actions">
                  <button type="button" className="icon-btn" aria-label={t('Remove {name} target', { name: subjectLabel(tg.subject, names) })} data-press="dim"
                    onClick={() => onChange({ ...profile, targets: profile.targets.filter(x => x.id !== tg.id) })}><PixelIcon name="trash" /></button>
                  {grip}
                </span>
              </ValueRow>
            )} />
        </div>
      )}
      <div className="form-group">
        <Select<string> label={profile.targets.length ? t('Another target for') : t('Target for')} value={draft.subject} onChange={v => setDraft({ ...draft, subject: v })}
          options={[
            ...main.map(e => ({ value: e.id, label: tn(e.name), group: t('Main lifts') })),
            { value: SUBJECT_BODYWEIGHT, label: t('Bodyweight'), group: t('Other') },
            { value: SUBJECT_SESSIONS, label: t('Sessions per week'), group: t('Other') },
            ...rest.map(e => ({ value: e.id, label: tn(e.name), group: t('All exercises') })),
          ]} />
        <Segmented<TargetType> label={t('Type')} value={draft.type} onChange={v => setDraft({ ...draft, type: v })}
          options={(['reach', 'hold', 'at_least'] as TargetType[]).map(v => ({ value: v, label: TARGET_TYPE_LABELS[v] }))} />
        <div className="grid2">
          <label className="field-wrap">
            <span className="label">{t('Value ({unit})', { unit: draft.subject ? subjectUnit(draft.subject) : 'kg' })}</span>
            <input className="field tnum" inputMode="decimal" value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} />
          </label>
          <DateField label={t('Deadline')} value={draft.deadline} min={today} confirmLabel={t('Set date')} onChange={v => setDraft({ ...draft, deadline: v })} />
        </div>
        <TargetLevelBar gym={gym} ctx={ctx} ex={byId.get(draft.subject)} value={Number(draft.value)} />
        <Errors errors={errors} />
        <button type="button" className="btn block split" onClick={add}><span>{t('Add target')}</span><PixelIcon name="plus" /></button>
      </div>
    </div>
  );
}

export function CheckpointsEditor({ profile, onChange }: { profile: Profile; onChange: Edit }) {
  const [d, setD] = useState<ISODate | ''>('');
  return (
    <div className="form-group">
      <p className="quiet">{t('Dates that show up on Today and on the goal board.')}</p>
      {profile.checkpoints.length > 0 && (
        <div className="sheetblk">
          {profile.checkpoints.map((c, i) => (
            <ValueRow key={c} k={String(i + 1)} value={formatDate(c)}>
              <button type="button" className="icon-btn" aria-label={t('Remove checkpoint {date}', { date: formatDate(c) })} data-press="dim"
                onClick={() => onChange({ ...profile, checkpoints: profile.checkpoints.filter(x => x !== c) })}><PixelIcon name="trash" /></button>
            </ValueRow>
          ))}
        </div>
      )}
      <div className="row end-row">
        <div className="grow"><DateField label={t('Add checkpoint')} value={d} confirmLabel={t('Set date')} onChange={setD} /></div>
        <button type="button" className="btn" disabled={!d || profile.checkpoints.includes(d)} onClick={() => {
          if (!d) return;
          onChange({ ...profile, checkpoints: [...profile.checkpoints, d].sort() });
          setD('');
        }}>{t('Add')}</button>
      </div>
    </div>
  );
}
