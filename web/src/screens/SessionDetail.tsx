// Session detail (spec §4 History) in Ink & Dither: the ledger — the committed
// promise with a verdict per lift (graded by the engine via app/coach), then
// the sets as spec-sheet rows — with edit set (sheet), delete set, change date
// and delete session.
import { useEffect, useRef, useState } from 'react';
import { readable } from '../ui/readable';
import type { EffortScale, PainArea, SetEntry, SetKind, Side } from '../domain/types';
import {
  changeSessionDate, deleteSession, deleteSet, getCommit, getDb, getProfile, getSession, getSessionSets, listExercises, updateSession, updateSet,
} from '../db';
import { useLive } from '../ui/useLive';
import { DatePickerSheet, Errors, useTrainedDays } from '../ui/common';
import { BigNumber, Button, ConfirmButton, Legend, NavBar, Parts, PixelIcon, Segmented, Select, Sheet, Stepper, Toggle, Verdict, back, showHud } from '../ui/kit';
import { DemoBanner } from '../app/DemoBanner';
import { gradeCommit } from '../app/coach';
import { formatDate, todayISO, weekday, weekdayLong } from '../app/dates';
import { formatRir, rirToScale, scaleToRir } from '../app/effort';
import { groupBlocks } from '../app/history';
import { PAIN_AREAS, PAIN_AREA_LABELS, SIDE_LABELS, displayName, formatLoad } from '../app/labels';
import { t, tn } from '../i18n';
import { SecHead } from '../ui/progress/parts';
import { anyDecimals, classifySets, setCountsText } from '../ui/progress/cellRules';
import { SetCellsKey } from '../ui/progress/SetCells';
import { kindAfterWarmupToggle } from '../ui/session/setKind';
import { SESSION_NAME_MAX, cleanSessionName } from '../ui/session/cleanName';
import { sessionLabel } from '../ui/session/text';
import { readinessWord } from '../ui/session/Readiness';
import { severityOptions } from '../ui/session/SetSheet';
import { Load } from '../ui/progress/Load';
import { loadParts } from '../ui/progress/stats';

export function SessionDetail({ params }: { params: string[] }) {
  const id = params[0];
  const data = useLive(async db => {
    const [session, sets, commit, profile, exercises] = await Promise.all([getSession(db, id), getSessionSets(db, id), getCommit(db, id), getProfile(db), listExercises(db, { includeArchived: true })]);
    const bwFactor = new Map(exercises.map(e => [e.id, e.bodyweightFactor]));
    const scale = (profile?.effortScale ?? 'rir') as EffortScale;
    return { session: session ?? null, sets, commit: commit ?? null, scale, bwFactor, grade: commit ? gradeCommit(commit, sets, scale) : null };
  }, [id]);
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const trained = useTrainedDays();

  if (!data) return <section className="screen tk-screen tk-nav" aria-busy="true"><NavBar title="" backLabel={t('Calendar')} fallback="history" large={false} /></section>;
  const { session, sets, commit, scale, bwFactor, grade } = data;
  if (!session) return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={t('Session')} backLabel={t('Calendar')} fallback="history" />
      <p className="tk-quiet">{t('This session doesn’t exist any more.')}</p>
    </section>
  );
  const load = (exerciseId: string) => (w: number) => formatLoad(w, bwFactor.get(exerciseId));

  return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={formatDate(session.date, { weekday: false })} backLabel={t('Calendar')} fallback="history"
        titleAction={<button type="button" className="icon-btn" aria-label={t('Change date')} data-press="dim" onClick={() => setMoving(true)}><PixelIcon name="edit" /></button>}>
        <div className="sd-name">
          <span className="sd-name-v">{sessionLabel(session.nameSnapshot)}</span>
          <button type="button" className="icon-btn" aria-label={t('Rename session')} data-press="dim" onClick={() => setRenaming(true)}><PixelIcon name="edit" /></button>
        </div>
        <div className="tk-sub">
          <span className="tk-mono">{weekdayLong(weekday(session.date))}</span>
          {!session.sealed && <span className="chip tk-chip">{t('in progress')}</span>}
          {session.edited && <span className="chip tk-chip">{t('edited')}</span>}
          {session.readiness && <span className="chip tk-chip">{t('readiness {r}', { r: readinessWord(session.readiness) })}</span>}
        </div>
      </NavBar>
      <DemoBanner />
      {session.note && <p className="tk-quiet">{session.note}</p>}

      {commit && grade && (
        <section className="tk-sec" aria-label={t('Plan')}>
          <SecHead title={t('Plan')} meta={t('locked in {date}', { date: formatDate(todayISO(commit.committedAt), { weekday: false }) })} />
          {grade.total > 0 && <BigNumber size="lg" value={grade.kept} unit={t('of {n}', { n: grade.total })} caption={grade.total === 1 ? t('plan met') : t('plans met')}
            label={t('{kept} of {total} plans met', { kept: grade.kept, total: grade.total })} />}
          <div className="tk-ledger">
            {grade.slots.map(g => (
              <div key={g.target.slotId} className="tk-led">
                <span className="tk-led-name">{tn(g.target.exerciseName)}</span>
                <span className="tk-led-p">{t('“{text}”', { text: readable(g.target.criterion) })}</span>
                <DoneLine parts={loadParts(g.sets, load(g.target.exerciseId))} />
                <span className="tk-led-d">{readable(g.result.detail)}</span>
                {g.target.why && <span className="tk-led-d">{t('Why: {why}', { why: readable(g.target.why) })}</span>}
                <Verdict kind={g.ungraded ? 'new' : g.result.verdict}>{g.ungraded ? t('Swapped') : undefined}</Verdict>
              </div>
            ))}
            {grade.added.map(a => (
              <div key={`add${a.slotOrder}`} className="tk-led">
                <span className="tk-led-name">{tn(a.name)}</span>
                <DoneLine parts={loadParts(a.sets, load(a.exerciseId))} />
                <span className="tk-led-d">{t('Added during the session: logged, not graded')}</span>
                <Verdict kind="new">{t('Added')}</Verdict>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="tk-sec" aria-label={t('Sets')}>
        <SecHead title={t('Sets')} meta={t('{n} logged, tap to edit', { n: sets.length })} />
        {sets.length === 0 && <p className="tk-quiet">{t('No sets logged.')}</p>}
        {sets.length > 0 && <Legend className="tk-legend tk-legend-top"><SetCellsKey /></Legend>}
        {groupBlocks(sets).map(b => {
          let w = 0, n = 0;
          const roles = classifySets(b.sets, bwFactor.get(b.exerciseId) ?? 0);
          return (
            <div key={b.key} className="tk-sheet">
              <div className="tk-sheet-hd">
                <a href={`#/lift/${encodeURIComponent(b.exerciseId)}`} data-press="dim">{tn(b.name)}<PixelIcon name="chevron" scale={1} /></a>
                <span>{setCountsText(b.sets, bwFactor.get(b.exerciseId) ?? 0)}</span>
              </div>
              {b.sets.map((s, si) => {
                const k = s.kind === 'warmup' ? t('W{n}', { n: ++w }) : s.kind === 'top' ? t('Top')
                  : s.kind === 'backoff' ? t('B{n}', { n: ++n }) : s.kind === 'drop' ? t('D{n}', { n: ++n }) : String(++n);
                const tags = [s.failed ? t('failed') : '',
                  s.importFlags?.includes('blank_weight') ? t('blank weight') : '', s.importFlags?.includes('blank_reps') ? t('blank reps') : ''].filter(Boolean);
                return (
                  <div key={s.id} className="tk-setwrap">
                    <button type="button" className={`tk-srow tk-set${s.kind === 'warmup' ? ' warm' : ''}`} data-press="row" onClick={() => setEditing(s)}
                      aria-label={t('Edit set {k}: {load} × {reps}', { k, load: formatLoad(s.weight, bwFactor.get(s.exerciseId)), reps: s.reps })}>
                      <span className="k">{k}</span>
                      <span className={`v tk-sd-cell ${roles[si]}`} title={roles[si] === 'top' ? t('Top set') : roles[si] === 'ramp' ? t('Ramp') : t('Work set')}><Load weight={s.weight} reps={s.reps} bodyweightFactor={bwFactor.get(s.exerciseId) ?? 0} decimals={anyDecimals(b.sets)} /></span>
                      <span className="k r">{formatRir(s.rir, scale)}</span>
                      <PixelIcon name="edit" scale={1} />
                    </button>
                    {tags.length > 0 && <p className="tk-tags">{tags.map(tag => <span key={tag} className="chip tk-chip">{tag}</span>)}</p>}
                    {s.pain && <p className="tk-mono tk-indent">{painLine(s.pain)}</p>}
                    {s.note && <p className="tk-quiet tk-indent">{s.note}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="tk-sec" aria-label={t('Session')}>
        {renaming && <RenameSheet current={displayName(session.nameSnapshot)} onClose={() => setRenaming(false)} onSave={async name => { await updateSession(getDb(), session.id, { nameSnapshot: name }); setRenaming(false); showHud({ text: t('Renamed') }); }} />}
        {moving && (
          <DatePickerSheet open value={session.date} max={todayISO()} levels={trained} title={t('Change date')} confirmLabel={t('Move session')} requireChange onClose={() => setMoving(false)}
            onPick={async d => { await changeSessionDate(getDb(), session.id, d); setMoving(false); showHud({ text: t('Date changed') }); }} />
        )}
        <ConfirmButton danger className="block" confirmLabel={t('Delete this session and its sets?')} confirmText={t('Delete session')}
          message={t('This can’t be undone.')} onConfirm={async () => {
            await deleteSession(getDb(), session.id);
            showHud({ text: t('Session deleted'), icon: 'trash' });
            back('history');
          }}>{t('Delete session')}</ConfirmButton>
      </section>

      {editing && <EditSetSheet set={editing} scale={scale} bwFactor={bwFactor.get(editing.exerciseId) ?? 0} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** "Pain: Shoulder (left), severity 2; note". (Row keys above: 1, 2 for working sets; B1 back-off; D1 drop.) */
function painLine(p: NonNullable<SetEntry['pain']>): string {
  const v = { area: PAIN_AREA_LABELS[p.area], n: p.severity };
  const line = p.side !== 'na' ? t('Pain: {area} ({side}), severity {n}', { ...v, side: SIDE_LABELS[p.side].toLowerCase() }) : t('Pain: {area}, severity {n}', v);
  return p.note ? t('{text}; {note}', { text: line, note: p.note }) : line;
}

function EditSetSheet({ set, scale, bwFactor, onClose }: { set: SetEntry; scale: EffortScale; bwFactor: number; onClose: () => void }) {
  const [weight, setWeight] = useState(set.weight);
  const [reps, setReps] = useState(set.reps);
  const [hasEffort, setHasEffort] = useState(set.rir !== undefined);
  const [effort, setEffort] = useState(rirToScale(set.rir ?? 2, scale));
  const [kind, setKind] = useState<SetKind>(set.kind);
  const [failed, setFailed] = useState(!!set.failed);
  const [note, setNote] = useState(set.note ?? '');
  const [painArea, setPainArea] = useState<PainArea | ''>(set.pain?.area ?? '');
  const [painSide, setPainSide] = useState<Side>(set.pain?.side ?? 'na');
  const [painSev, setPainSev] = useState<1 | 2 | 3>(set.pain?.severity ?? 1);
  const [errors, setErrors] = useState<string[]>([]);

  const save = async () => {
    const errs: string[] = [];
    if (!Number.isInteger(reps) || reps < 0) errs.push(t('Reps must be a whole number'));
    setErrors(errs);
    if (errs.length) return;
    const flags = set.importFlags?.filter(f => (f === 'blank_weight' ? weight === set.weight : reps === set.reps));
    // Clearing fields: updateSet drops keys set to undefined.
    await updateSet(getDb(), set.id, {
      weight, reps, kind,
      rir: hasEffort ? scaleToRir(effort, scale) : undefined,
      failed: failed || undefined,
      note: note.trim() || undefined,
      pain: painArea ? { area: painArea, side: painSide, severity: painSev, ...(set.pain?.note ? { note: set.pain.note } : {}) } : undefined,
      // An edited value is no longer a blank import value.
      importFlags: flags?.length ? flags : undefined,
    });
    showHud(t('Set saved'));
    onClose();
  };

  return (
    <Sheet open title={t('Edit set: {name}', { name: tn(set.exerciseNameSnapshot) })} onClose={onClose}>
      <p className="tk-mono mid">{formatLoad(weight, bwFactor)} × {reps}{hasEffort ? `, ${formatRir(scaleToRir(effort, scale), scale)}` : ''}</p>
      <div className="grid2 steppers">
        <Stepper label={bwFactor > 0 ? t('Added weight') : t('Weight')} unit="kg" value={weight} step={2.5} min={-200} max={500} onChange={setWeight} />
        <Stepper label={t('Reps')} value={reps} min={0} max={100} onChange={setReps} />
      </div>
      <Toggle label={t('Effort recorded')} checked={hasEffort} onChange={setHasEffort} />
      {hasEffort && (scale === 'rpe'
        ? <Stepper label="RPE" value={effort} step={0.5} min={5} max={10} onChange={setEffort} />
        : <Stepper label="RIR" value={effort} step={0.5} min={0} max={5} onChange={setEffort} />)}
      <Toggle label={t('Warm-up')} hint={t('Left out of volume and bests')} checked={kind === 'warmup'} onChange={on => setKind(kindAfterWarmupToggle(set.kind, on))} />
      <Toggle label={t('Failed rep')} checked={failed} onChange={setFailed} />
      <Select<PainArea | ''> label={t('Pain')} value={painArea} onChange={setPainArea}
        options={[{ value: '', label: t('None') }, ...PAIN_AREAS.map(a => ({ value: a, label: PAIN_AREA_LABELS[a] }))]} />
      {painArea && <>
        <Segmented<Side> label={t('Side')} value={painSide} onChange={setPainSide}
          options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? t('N/A') : SIDE_LABELS[s] }))} />
        <Segmented<'1' | '2' | '3'> label={t('Severity')} value={String(painSev) as '1' | '2' | '3'} onChange={v => setPainSev(Number(v) as 1 | 2 | 3)}
          options={severityOptions()} />
      </>}
      <label className="stack"><span className="label">{t('Note')}</span>
        <textarea className="field" value={note} onChange={e => setNote(e.target.value)} /></label>
      <Errors errors={errors} />
      <Button variant="primary" block icon="check" onClick={save}>{t('Save set')}</Button>
      <ConfirmButton danger className="block" confirmLabel={t('Delete this set?')} confirmText={t('Delete set')} onConfirm={async () => {
        await deleteSet(getDb(), set.id);
        showHud({ text: t('Set deleted'), icon: 'trash' });
        onClose();
      }}>{t('Delete set')}</ConfirmButton>
    </Sheet>
  );
}

/** What was done for a promise; "—" (nothing) reads as words, not a dash. */
function DoneLine({ parts }: { parts: string[] }) {
  if (!parts.length) return <span className="tk-led-r none">{t('Nothing logged')}</span>;
  return <Parts items={parts} className="tk-led-r" />;
}

/** Rename this session only: a text field in a sheet, Save disabled until the name is usable. */
function RenameSheet({ current, onSave, onClose }: { current: string; onSave: (name: string) => void; onClose: () => void }) {
  const [text, setText] = useState(current);
  const name = cleanSessionName(text);
  const input = useRef<HTMLInputElement>(null);
  // The sheet focuses its own panel when it opens; take focus after that so typing starts at once.
  useEffect(() => { const id = setTimeout(() => input.current?.focus(), 60); return () => clearTimeout(id); }, []);
  return (
    <Sheet open title={t('Rename session')} onClose={onClose}>
      <label className="field-wrap">
        <span className="label">{t('Session name')}</span>
        <input className="field" ref={input} value={text} maxLength={SESSION_NAME_MAX} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name) onSave(name); }} />
      </label>
      <p className="quiet">{t('Renames this session only.')}</p>
      <Button variant="primary" block disabled={!name || name === current} onClick={() => name && onSave(name)}>{t('Save')}</Button>
    </Sheet>
  );
}
