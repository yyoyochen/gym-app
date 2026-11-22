// Session detail (spec §4 History) in Ink & Dither: the ledger — the committed
// promise with a verdict per lift (graded by the engine via app/coach), then
// the sets as spec-sheet rows — with edit set (sheet), delete set, change date
// and delete session.
import { useState } from 'react';
import { readable } from '../ui/readable';
import type { EffortScale, PainArea, SetEntry, SetKind, Side } from '../domain/types';
import {
  changeSessionDate, deleteSession, deleteSet, getCommit, getDb, getProfile, getSession, getSessionSets, listExercises, updateSet,
} from '../db';
import { useLive } from '../ui/useLive';
import { DatePickerSheet, Errors, useTrainedDates } from '../ui/common';
import { BigNumber, Button, ConfirmButton, NavBar, Parts, PixelIcon, Segmented, Select, Sheet, Stepper, Toggle, Verdict, back, showHud } from '../ui/kit';
import { DemoBanner } from '../app/DemoBanner';
import { gradeCommit } from '../app/coach';
import { formatDate, todayISO } from '../app/dates';
import { formatRir, rirToScale, scaleToRir } from '../app/effort';
import { groupBlocks } from '../app/history';
import { PAIN_AREAS, PAIN_AREA_LABELS, SET_KIND_LABELS, SIDE_LABELS, displayName, formatLoad } from '../app/labels';
import { SecHead } from '../ui/progress/parts';
import { setCountsText } from '../ui/progress/cellRules';
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
  const trained = useTrainedDates();

  if (!data) return <section className="screen tk-screen tk-nav" aria-busy="true"><NavBar title="" backLabel="History" fallback="history" large={false} /></section>;
  const { session, sets, commit, scale, bwFactor, grade } = data;
  if (!session) return (
    <section className="screen tk-screen tk-nav">
      <NavBar title="Session" backLabel="History" fallback="history" />
      <p className="tk-quiet">This session doesn’t exist any more.</p>
    </section>
  );
  const load = (exerciseId: string) => (w: number) => formatLoad(w, bwFactor.get(exerciseId));

  return (
    <section className="screen tk-screen tk-nav">
      <NavBar title={displayName(session.nameSnapshot)} backLabel="History" fallback="history">
        <div className="tk-sub">
          <span className="tk-mono">{formatDate(session.date)}</span>
          {!session.sealed && <span className="chip tk-chip">in progress</span>}
          {session.edited && <span className="chip tk-chip">edited</span>}
          {session.readiness && <span className="chip tk-chip">readiness {session.readiness}</span>}
        </div>
      </NavBar>
      <DemoBanner />
      {session.note && <p className="tk-quiet">{session.note}</p>}

      {commit && grade && (
        <section className="tk-sec" aria-label="Promise">
          <SecHead title="Promise" meta={`committed ${formatDate(todayISO(commit.committedAt), { weekday: false })}`} />
          {grade.total > 0 && <BigNumber size="lg" value={grade.kept} unit={`of ${grade.total}`} caption={`promise${grade.total === 1 ? '' : 's'} kept`}
            label={`${grade.kept} of ${grade.total} promises kept`} />}
          <div className="tk-ledger">
            {grade.slots.map(g => (
              <div key={g.target.slotId} className="tk-led">
                <span className="tk-led-name">{g.target.exerciseName}</span>
                <span className="tk-led-p">“{readable(g.target.criterion)}”</span>
                <DoneLine parts={loadParts(g.sets, load(g.target.exerciseId))} />
                <span className="tk-led-d">{readable(g.result.detail)}</span>
                {g.target.why && <span className="tk-led-d">Why: {readable(g.target.why)}</span>}
                <Verdict kind={g.ungraded ? 'new' : g.result.verdict}>{g.ungraded ? 'Swapped' : undefined}</Verdict>
              </div>
            ))}
            {grade.added.map(a => (
              <div key={`add${a.slotOrder}`} className="tk-led">
                <span className="tk-led-name">{a.name}</span>
                <DoneLine parts={loadParts(a.sets, load(a.exerciseId))} />
                <span className="tk-led-d">Added during the session: logged, not graded</span>
                <Verdict kind="new">Added</Verdict>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="tk-sec" aria-label="Sets">
        <SecHead title="Sets" meta={`${sets.length} logged, tap to edit`} />
        {sets.length === 0 && <p className="tk-quiet">No sets logged.</p>}
        {groupBlocks(sets).map(b => {
          let w = 0, n = 0;
          return (
            <div key={b.key} className="tk-sheet">
              <div className="tk-sheet-hd">
                <a href={`#/lift/${encodeURIComponent(b.exerciseId)}`} data-press="dim">{b.name}<PixelIcon name="chevron" scale={1} /></a>
                <span>{setCountsText(b.sets, bwFactor.get(b.exerciseId) ?? 0)}</span>
              </div>
              {b.sets.map(s => {
                const k = s.kind === 'warmup' ? `W${++w}` : s.kind === 'top' ? 'Top' : `${KIND_PREFIX[s.kind] ?? ''}${++n}`;
                const tags = [s.failed ? 'failed' : '',
                  s.importFlags?.includes('blank_weight') ? 'blank weight' : '', s.importFlags?.includes('blank_reps') ? 'blank reps' : ''].filter(Boolean);
                return (
                  <div key={s.id} className="tk-setwrap">
                    <button type="button" className={`tk-srow tk-set${s.kind === 'warmup' ? ' warm' : ''}`} data-press="row" onClick={() => setEditing(s)}
                      aria-label={`Edit set ${k}: ${formatLoad(s.weight, bwFactor.get(s.exerciseId))} × ${s.reps}`}>
                      <span className="k">{k}</span>
                      <span className="v">{formatLoad(s.weight, bwFactor.get(s.exerciseId))} × {s.reps}</span>
                      <span className="k r">{formatRir(s.rir, scale)}</span>
                      <PixelIcon name="edit" scale={1} />
                    </button>
                    {tags.length > 0 && <p className="tk-tags">{tags.map(t => <span key={t} className="chip tk-chip">{t}</span>)}</p>}
                    {s.pain && <p className="tk-mono tk-indent">Pain: {PAIN_AREA_LABELS[s.pain.area]}{s.pain.side !== 'na' ? ` (${SIDE_LABELS[s.pain.side].toLowerCase()})` : ''}, severity {s.pain.severity}{s.pain.note ? `; ${s.pain.note}` : ''}</p>}
                    {s.note && <p className="tk-quiet tk-indent">{s.note}</p>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="tk-sec" aria-label="Session">
        <SecHead title="Session" />
        <Button block onClick={() => setMoving(true)}>Change date</Button>
        {moving && (
          <DatePickerSheet open value={session.date} max={todayISO()} marked={trained} title="Change date" confirmLabel="Move session" onClose={() => setMoving(false)}
            onPick={async d => { await changeSessionDate(getDb(), session.id, d); setMoving(false); showHud({ text: 'Date changed' }); }} />
        )}
        <ConfirmButton danger className="block" confirmLabel="Delete this session and its sets?" confirmText="Delete session"
          message="This can’t be undone." onConfirm={async () => {
            await deleteSession(getDb(), session.id);
            showHud({ text: 'Session deleted', icon: 'trash' });
            back('history');
          }}>Delete session</ConfirmButton>
      </section>

      {editing && <EditSetSheet set={editing} scale={scale} bwFactor={bwFactor.get(editing.exerciseId) ?? 0} onClose={() => setEditing(null)} />}
    </section>
  );
}


const KINDS: SetKind[] = ['warmup', 'working', 'top', 'backoff', 'drop'];
/** Spec-sheet row keys: 1, 2 for working sets; B1 back-off; D1 drop. */
const KIND_PREFIX: Partial<Record<SetKind, string>> = { backoff: 'B', drop: 'D' };

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
    if (!Number.isInteger(reps) || reps < 0) errs.push('Reps must be a whole number');
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
    showHud('Set saved');
    onClose();
  };

  return (
    <Sheet open title={`Edit set: ${set.exerciseNameSnapshot}`} onClose={onClose}>
      <p className="tk-mono mid">{formatLoad(weight, bwFactor)} × {reps}{hasEffort ? `, ${formatRir(scaleToRir(effort, scale), scale)}` : ''}</p>
      <div className="grid2 steppers">
        <Stepper label={bwFactor > 0 ? 'Added weight' : 'Weight'} unit="kg" value={weight} step={2.5} min={-200} max={500} onChange={setWeight} />
        <Stepper label="Reps" value={reps} min={0} max={100} onChange={setReps} />
      </div>
      <Toggle label="Effort recorded" checked={hasEffort} onChange={setHasEffort} />
      {hasEffort && (scale === 'rpe'
        ? <Stepper label="RPE" value={effort} step={0.5} min={5} max={10} onChange={setEffort} />
        : <Stepper label="RIR" value={effort} step={0.5} min={0} max={5} onChange={setEffort} />)}
      <Segmented<SetKind> label="Kind" value={kind} onChange={setKind} options={KINDS.map(k => ({ value: k, label: SET_KIND_LABELS[k] }))} />
      <Toggle label="Failed rep" checked={failed} onChange={setFailed} />
      <Select<PainArea | ''> label="Pain" value={painArea} onChange={setPainArea}
        options={[{ value: '', label: 'None' }, ...PAIN_AREAS.map(a => ({ value: a, label: PAIN_AREA_LABELS[a] }))]} />
      {painArea && <>
        <Segmented<Side> label="Side" value={painSide} onChange={setPainSide}
          options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? 'N/A' : SIDE_LABELS[s] }))} />
        <Segmented<'1' | '2' | '3'> label="Severity" value={String(painSev) as '1' | '2' | '3'} onChange={v => setPainSev(Number(v) as 1 | 2 | 3)}
          options={[{ value: '1', label: '1 niggle' }, { value: '2', label: '2 changed' }, { value: '3', label: '3 stopped' }]} />
      </>}
      <label className="stack"><span className="label">Note</span>
        <textarea className="field" value={note} onChange={e => setNote(e.target.value)} /></label>
      <Errors errors={errors} />
      <Button variant="primary" block icon="check" onClick={save}>Save set</Button>
      <ConfirmButton danger className="block" confirmLabel="Delete this set?" confirmText="Delete set" onConfirm={async () => {
        await deleteSet(getDb(), set.id);
        showHud({ text: 'Set deleted', icon: 'trash' });
        onClose();
      }}>Delete set</ConfirmButton>
    </Sheet>
  );
}

/** What was done for a promise; "—" (nothing) reads as words, not a dash. */
function DoneLine({ parts }: { parts: string[] }) {
  if (!parts.length) return <span className="tk-led-r none">Nothing logged</span>;
  return <Parts items={parts} className="tk-led-r" />;
}
