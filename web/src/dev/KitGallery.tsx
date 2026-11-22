// Preview-only gallery of the Ink & Dither kit (#/kit). Loaded lazily and only
// when import.meta.env.MODE === 'preview' (App.tsx), so production builds drop
// it. Screen workers: this is the reference for every kit component.
import { useState } from 'react';
import { listSetsByDate } from '../db';
import { useLive } from '../ui/useLive';
import { todayISO } from '../app/dates';
import {
  ActionSheet, BigNumber, Button, ConfirmButton, DitherBar, GlyphHeatmap, ICONS, LabelValueGrid, Lockup, NavBar, PixelIcon,
  Segmented, Sheet, Stepper, Toggle, Verdict, go, showHud, showPrMoment, useTheme, type IconName, type ThemePref,
} from '../ui/kit';
import { TYPE_ROLES } from '../ui/kit/typeRoles';

export default function KitGallery({ params }: { params: string[] }) {
  const depth = Number(params[0] ?? 0) || 0;
  const today = todayISO(Date.now());
  const counts = useLive(async db => {
    const sets = await listSetsByDate(db, {});
    const m: Record<string, number> = {};
    for (const s of sets) if (s.kind !== 'warmup') m[s.date] = (m[s.date] ?? 0) + 1;
    return m;
  }, []);
  const { theme, setTheme } = useTheme();
  const [sheet, setSheet] = useState(false);
  const [tall, setTall] = useState(false);
  const [as, setAs] = useState(false);
  const [w, setW] = useState(100);
  const [reps, setReps] = useState(2);
  const [rir, setRir] = useState<'0' | '1' | '2' | '3' | '4' | '5'>('2');
  const [on, setOn] = useState(true);

  return (
    <section className="screen kit-gallery">
      <NavBar title={depth ? `Kit: page ${depth}` : 'Kit'} backLabel={depth ? 'Back' : undefined} right={<span className="label">{theme}</span>} />
      <Lockup mid={`Training log //Session A`} />
      <BigNumber value="100" unit="kg × 2" caption="top double" />
      <div className="stack kit-types">
        <span className="label">Type roles</span>
        {TYPE_ROLES.map(r => (
          <div key={r.role} className="kit-type"><span className="label">{r.role}: {r.job}</span><span className={`t-${r.role}`}>{r.sample}</span></div>
        ))}
      </div>
      <LabelValueGrid items={[
        { label: 'Effort floor', value: '2 in reserve' }, { label: 'Back-offs', value: '3 × 8 at 75' },
        { label: 'Last time', value: '105 × 2' }, { label: 'This week', value: '2 of 3', accent: true },
      ]} />
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        <DitherBar label="This week" valueText="2 of 3" value={2 / 3} />
        <DitherBar label="Squat: hold 120 by 31 Dec" valueText="116.7, 97%" value={116.7 / 120} />
        <DitherBar label="Empty" valueText="0" value={0} />
      </div>
      <div className="stack">
        <span className="label">Last 12 weeks</span>
        {counts && <GlyphHeatmap counts={counts} weeks={12} end={today} weekTarget={3} legend onSelect={d => showHud({ text: d, icon: 'history' })} />}
      </div>
      {counts && <GlyphHeatmap counts={counts} weeks={34} end={today} label="Since April" />}
      <LabelValueGrid variant="stats" items={[{ label: 'Favourite lift:', value: 'Back squat' }, { label: 'Busiest day:', value: 'Sunday' }]} />
      <div className="row wrap" style={{ gap: 'var(--space-2)' }}>
        <Verdict kind="beat" /><Verdict kind="hit" /><Verdict kind="missed" /><Verdict kind="new" />
      </div>
      <p className="note">//Note: last back-off is next. Take it to 1–2 in reserve.</p>
      <div className="row wrap" style={{ gap: 'var(--space-4)' }}>
        {(Object.keys(ICONS) as IconName[]).map(n => <span key={n} title={n}><PixelIcon name={n} scale={3} /></span>)}
      </div>
      <Segmented<ThemePref> label="Theme" value={theme} onChange={setTheme}
        options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      <div className="grid2">
        <Stepper label="Weight" unit="kg" value={w} step={2.5} min={0} onChange={setW} />
        <Stepper label="Reps" value={reps} min={0} onChange={setReps} />
      </div>
      <Segmented label="Reps in reserve" value={rir} onChange={setRir} options={(['0', '1', '2', '3', '4', '5'] as const).map(v => ({ value: v, label: v }))} />
      <Toggle label="Failed" hint="Fewer reps than intended" checked={on} onChange={setOn} />
      <Button variant="primary" block iconEnd="plus" onClick={() => go(`kit/${depth + 1}`)}>Push a page</Button>
      <div className="grid2">
        <Button onClick={() => setSheet(true)}>Sheet</Button>
        <Button onClick={() => setTall(true)}>Tall sheet</Button>
        <Button onClick={() => setAs(true)}>Action sheet</Button>
        <Button onClick={() => showHud('Session saved')}>HUD</Button>
        <Button icon="flame" onClick={() => showPrMoment({ value: '107.5', unit: 'kg × 2', caption: 'new best double', lift: 'Back squat',
          pairs: [{ label: 'Previous best', value: '105 × 2' }, { label: 'e1RM', value: '112.0 → 114.7' }] })}>PR moment</Button>
        <Button variant="quiet">Quiet</Button>
      </div>
      <ConfirmButton danger className="block" confirmLabel="Tap again to delete this set" onConfirm={() => showHud({ text: 'Deleted', icon: 'trash' })}>Delete set</ConfirmButton>
      <Sheet open={sheet} title="Adjust & log set" onClose={() => setSheet(false)}>
        <div className="grid2">
          <Stepper label="Weight" unit="kg" value={w} step={2.5} min={0} onChange={setW} />
          <Stepper label="Reps" value={reps} min={0} onChange={setReps} />
        </div>
        <Segmented label="Reps in reserve" value={rir} onChange={setRir} options={(['0', '1', '2', '3', '4', '5'] as const).map(v => ({ value: v, label: v }))} />
        <Button variant="primary" block icon="check" onClick={() => { setSheet(false); showHud('Set logged'); }}>Log set</Button>
      </Sheet>
      <Sheet open={tall} title="Long content" onClose={() => setTall(false)}>
        {Array.from({ length: 30 }, (_, i) => <p key={i} className="line">Row {i + 1}: medium detent first; drag up for large, fling down to dismiss.</p>)}
      </Sheet>
      <ActionSheet open={as} title="Finish session A?" message="2 sets not logged." onClose={() => setAs(false)}
        actions={[{ label: 'Finish session', onSelect: () => showHud('Session saved') }, { label: 'Discard session', destructive: true, onSelect: () => showHud({ text: 'Discarded', icon: 'trash' }) }]} />
    </section>
  );
}
