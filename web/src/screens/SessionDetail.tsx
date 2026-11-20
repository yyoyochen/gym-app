// Session detail (spec §4 History): the ledger — promise + sets — with edit,
// delete set, change date and delete session.
import { useState } from 'react';
import type { EffortScale, PainArea, SetEntry, SetKind, Side } from '../domain/types';
import {
  changeSessionDate, deleteSession, deleteSet, getCommit, getDb, getProfile, getSession, getSessionSets, updateSet,
} from '../db';
import { useLive } from '../ui/useLive';
import { go } from '../ui/router';
import { ConfirmButton, DateField, Errors, Segmented, Sheet, Stepper } from '../ui/common';
import { DemoBanner } from '../app/DemoBanner';
import { formatDate, todayISO } from '../app/dates';
import { formatRir, rirToScale, scaleToRir } from '../app/effort';
import { groupBlocks } from '../app/history';
import { PAIN_AREAS, PAIN_AREA_LABELS, SET_KIND_LABELS, SIDE_LABELS } from '../app/labels';

export function SessionDetail({ params }: { params: string[] }) {
  const id = params[0];
  const data = useLive(async db => {
    const [session, sets, commit, profile] = await Promise.all([getSession(db, id), getSessionSets(db, id), getCommit(db, id), getProfile(db)]);
    return { session: session ?? null, sets, commit: commit ?? null, scale: (profile?.effortScale ?? 'rir') as EffortScale };
  }, [id]);
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [moving, setMoving] = useState(false);

  if (!data) return <section className="screen"><a className="back" href="#/history">‹ History</a></section>;
  const { session, sets, commit, scale } = data;
  if (!session) return (
    <section className="screen">
      <a className="back" href="#/history">‹ History</a>
      <p className="mid">This session doesn’t exist any more.</p>
    </section>
  );

  return (
    <section className="screen">
      <DemoBanner />
      <a className="back" href="#/history">‹ History</a>
      <div className="stack tight">
        <h1 className="title">{session.nameSnapshot}</h1>
        <div className="row wrap">
          <span className="mono num-sm mid">{formatDate(session.date)}</span>
          {!session.sealed && <span className="chip">in progress</span>}
          {session.edited && <span className="chip">edited</span>}
          {session.readiness && <span className="chip">readiness {session.readiness}</span>}
        </div>
        {session.note && <p className="mid">{session.note}</p>}
      </div>

      {commit && (
        <div className="stack">
          <span className="label">Promise · committed {formatDate(todayISO(commit.committedAt), { weekday: false })}</span>
          {commit.targets.map(t => (
            <div key={t.slotId} className="card tick ledger">
              <div className="spread">
                <span className="heading">{t.exerciseName}</span>
                {/* TODO(engine): verdict chip (BEAT / HIT / MISSED / NEW) + detail string from the coach engine's grading. */}
                <span className="verdict new">—</span>
              </div>
              <p className="mid">“{t.criterion}”</p>
              {t.why && <p className="mid">Why: {t.why}</p>}
            </div>
          ))}
        </div>
      )}

      {sets.length === 0 && <p className="mid">No sets logged.</p>}
      {groupBlocks(sets).map(b => (
        <div key={b.key} className="card stack">
          <a className="heading" href={`#/lift/${encodeURIComponent(b.exerciseId)}`}>{b.name}</a>
          <ul className="plain set-list">
            {b.sets.map((s, i) => (
              <li key={s.id}>
                <button className="set-line" onClick={() => setEditing(s)} aria-label={`Edit set ${i + 1}`}>
                  <span className="mono mid set-no">{i + 1}</span>
                  <span className="mono num-md">{s.weight} <span className="mid">×</span> {s.reps}</span>
                  <span className="mono num-sm mid">{formatRir(s.rir, scale)}</span>
                  <span className="set-tags">
                    {s.kind !== 'working' && <span className="chip inline">{SET_KIND_LABELS[s.kind]}</span>}
                    {s.failed && <span className="chip inline">failed</span>}
                    {s.importFlags?.includes('blank_weight') && <span className="chip inline">blank weight</span>}
                    {s.importFlags?.includes('blank_reps') && <span className="chip inline">blank reps</span>}
                  </span>
                </button>
                {s.pain && <p className="pain-line">Pain: {PAIN_AREA_LABELS[s.pain.area]}{s.pain.side !== 'na' ? ` (${SIDE_LABELS[s.pain.side].toLowerCase()})` : ''} · severity <span className="mono">{s.pain.severity}</span>{s.pain.note ? ` · ${s.pain.note}` : ''}</p>}
                {s.note && <p className="mid set-note">{s.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="card stack">
        <span className="label">Session</span>
        {moving
          ? <MoveDate current={session.date} onCancel={() => setMoving(false)} onMove={async d => { await changeSessionDate(getDb(), session.id, d); setMoving(false); }} />
          : <button className="btn" onClick={() => setMoving(true)}>Change date</button>}
        <ConfirmButton danger confirmLabel="Tap again to delete this session and its sets" onConfirm={async () => {
          await deleteSession(getDb(), session.id);
          go('history');
        }}>Delete session</ConfirmButton>
      </div>

      {editing && <EditSetSheet set={editing} scale={scale} onClose={() => setEditing(null)} />}
    </section>
  );
}

function MoveDate({ current, onMove, onCancel }: { current: string; onMove: (d: string) => void; onCancel: () => void }) {
  const [d, setD] = useState(current);
  return (
    <div className="stack">
      <DateField label="New date" value={d} max={todayISO()} onChange={setD} />
      <div className="row">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary grow" disabled={!d || d === current} onClick={() => onMove(d)}>Move session</button>
      </div>
    </div>
  );
}

const KINDS: SetKind[] = ['warmup', 'working', 'top', 'backoff', 'drop'];

function EditSetSheet({ set, scale, onClose }: { set: SetEntry; scale: EffortScale; onClose: () => void }) {
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
    onClose();
  };

  return (
    <Sheet open title={`Edit set · ${set.exerciseNameSnapshot}`} onClose={onClose}>
      <div className="grid2 steppers">
        <Stepper label="Weight" unit="kg" value={weight} step={2.5} min={-200} max={500} onChange={setWeight} />
        <Stepper label="Reps" value={reps} min={0} max={100} onChange={setReps} />
      </div>
      <div className="stack">
        <label className="row check"><input type="checkbox" checked={hasEffort} onChange={e => setHasEffort(e.target.checked)} /> Effort recorded</label>
        {hasEffort && (scale === 'rpe'
          ? <Stepper label="RPE" value={effort} step={0.5} min={5} max={10} onChange={setEffort} />
          : <Stepper label="RIR" value={effort} step={0.5} min={0} max={5} onChange={setEffort} />)}
      </div>
      <label className="stack"><span className="label">Kind</span>
        <select className="field" value={kind} onChange={e => setKind(e.target.value as SetKind)}>
          {KINDS.map(k => <option key={k} value={k}>{SET_KIND_LABELS[k]}</option>)}
        </select></label>
      <label className="row check"><input type="checkbox" checked={failed} onChange={e => setFailed(e.target.checked)} /> Failed rep</label>
      <label className="stack"><span className="label">Pain</span>
        <select className="field" value={painArea} onChange={e => setPainArea(e.target.value as PainArea | '')}>
          <option value="">None</option>
          {PAIN_AREAS.map(a => <option key={a} value={a}>{PAIN_AREA_LABELS[a]}</option>)}
        </select></label>
      {painArea && <>
        <Segmented<Side> label="Side" value={painSide} onChange={setPainSide}
          options={(['left', 'right', 'both', 'na'] as Side[]).map(s => ({ value: s, label: s === 'na' ? 'N/A' : SIDE_LABELS[s] }))} />
        <Segmented<'1' | '2' | '3'> label="Severity" value={String(painSev) as '1' | '2' | '3'} onChange={v => setPainSev(Number(v) as 1 | 2 | 3)}
          options={[{ value: '1', label: '1 niggle' }, { value: '2', label: '2 changed lift' }, { value: '3', label: '3 stopped' }]} />
      </>}
      <label className="stack"><span className="label">Note</span>
        <textarea className="field" value={note} onChange={e => setNote(e.target.value)} /></label>
      <Errors errors={errors} />
      <button className="btn primary block" onClick={save}>Save set</button>
      <ConfirmButton danger className="block" confirmLabel="Tap again to delete this set" onConfirm={async () => { await deleteSet(getDb(), set.id); onClose(); }}>Delete set</ConfirmButton>
    </Sheet>
  );
}
