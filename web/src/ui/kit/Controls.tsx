// Controls: Button, Stepper (auto-repeat on hold), Segmented (draggable
// thumb on a spring), Toggle. Every control is ≥ 48px tall and keyboard-usable.
import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';
import { SPRINGS, animateSpring, type SpringHandle } from './motion/spring';
import { prefersReducedMotion } from './motion/reduced';

// ---------------------------------------------------------------- Button

export type ButtonVariant = 'primary' | 'outline' | 'quiet' | 'danger';

type ButtonBase = { variant?: ButtonVariant; icon?: IconName; iconEnd?: IconName; block?: boolean; children?: ReactNode; className?: string };

/** Primary = ink block with mono caps label; outline = 1.5px ink; quiet = text; danger = dashed outline. */
export function Button({ variant = 'outline', icon, iconEnd, block, className = '', children, type = 'button', ...rest }: ButtonBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, block, `${iconEnd && !icon ? 'split ' : ''}${className}`)} {...rest}>
      {icon && <PixelIcon name={icon} />}{children !== undefined && <span>{children}</span>}{iconEnd && <PixelIcon name={iconEnd} />}
    </button>
  );
}

/** Same look, as a link (`href="#/…"` routes through history like any link). */
export function LinkButton({ variant = 'outline', icon, iconEnd, block, className = '', children, ...rest }: ButtonBase & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass(variant, block, `${iconEnd && !icon ? 'split ' : ''}${className}`)} {...rest}>
      {icon && <PixelIcon name={icon} />}{children !== undefined && <span>{children}</span>}{iconEnd && <PixelIcon name={iconEnd} />}
    </a>
  );
}

function buttonClass(v: ButtonVariant, block: boolean | undefined, extra: string) {
  return ['btn', v === 'outline' ? '' : v, block ? 'block' : '', extra].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Stepper

export interface StepperProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Digits after the decimal point shown in the field (default: as needed). */
  decimals?: number;
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Hold-to-repeat timing (UIStepper): first repeat after 500 ms, then accelerating to 60 ms. */
export function repeatDelays(count: number, first = 500, start = 160, factor = 0.85, floor = 60): number[] {
  const out: number[] = [];
  let gap = start;
  for (let i = 0; i < count; i++) {
    if (i === 0) { out.push(first); continue; }
    out.push(Math.round(gap));
    gap = Math.max(floor, gap * factor);
  }
  return out;
}

/** − [value] + . Changes on touch-down, auto-repeats while held; the value is typeable (commits on blur/Enter). */
export function Stepper({ label, value, onChange, step = 1, min, max, unit, decimals }: StepperProps) {
  const show = (v: number) => (decimals !== undefined ? v.toFixed(decimals) : String(round(v)));
  const [text, setText] = useState(show(value));
  const live = useRef(value);
  live.current = value;
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => setText(show(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const n = Number(text.trim().replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) cb.current(round(clamp(n, min, max)));
    else setText(show(value));
  };
  const bump = (dir: 1 | -1) => {
    const next = round(clamp(live.current + dir * step, min, max));
    if (next === live.current) return false;
    live.current = next;
    cb.current(next);
    return true;
  };
  return (
    <div className="stepper" data-no-drag>
      <span className="label">{label}{unit && <span className="stepper-unit"> · {unit}</span>}</span>
      <div className="stepper-row">
        <RepeatButton label={`${label} minus ${step}`} icon="minus" disabled={min !== undefined && value <= min} onStep={() => bump(-1)} />
        <input className="field stepper-input" inputMode="decimal" aria-label={unit ? `${label} (${unit})` : label} value={text}
          onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <RepeatButton label={`${label} plus ${step}`} icon="plus" disabled={max !== undefined && value >= max} onStep={() => bump(1)} />
      </div>
    </div>
  );
}

function RepeatButton({ label, icon, disabled, onStep }: { label: string; icon: IconName; disabled?: boolean; onStep: () => boolean }) {
  const timer = useRef(0);
  const step = useRef(onStep);
  step.current = onStep;
  const stop = () => { clearTimeout(timer.current); timer.current = 0; };
  useEffect(() => stop, []);
  return (
    <button type="button" className="btn stepper-btn" aria-label={label} disabled={disabled}
      onPointerDown={e => {
        if (e.button !== 0) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
        if (!step.current()) return;
        const delays = repeatDelays(400);
        let i = 0;
        const rep = () => { if (!step.current()) { stop(); return; } timer.current = window.setTimeout(rep, delays[Math.min(++i, delays.length - 1)]); };
        timer.current = window.setTimeout(rep, delays[0]);
      }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClick={e => { if (e.detail === 0) step.current(); /* keyboard */ }}>
      <PixelIcon name={icon} />
    </button>
  );
}

// ---------------------------------------------------------------- Segmented

export interface SegOption<T extends string> { value: T; label: string }

/** What choosing segment `i` does: nothing (already selected), pick its value, or (allowDeselect, tapping the selected one) clear. */
export function segmentedChoice<T extends string>(
  options: readonly SegOption<T>[], i: number, value: T | undefined, allowDeselect = false,
): { change: false } | { change: true; value: T | undefined } {
  const o = options[i];
  if (!o) return { change: false };
  if (o.value !== value) return { change: true, value: o.value };
  return allowDeselect ? { change: true, value: undefined } : { change: false };
}

type SegmentedProps<T extends string> = { label?: string; options: SegOption<T>[]; value: T | undefined } & (
  | { allowDeselect?: false; onChange: (v: T) => void }
  /** Tapping the selected segment again clears it: onChange(undefined). */
  | { allowDeselect: true; onChange: (v: T | undefined) => void }
);

/**
 * Segmented control (radio group). The ink thumb slides on a spring; press
 * the thumb and drag it across segments, release to pick. Arrow keys move.
 * With `allowDeselect`, tapping the selected segment clears the value.
 */
export function Segmented<T extends string>({ label, options, value, onChange, allowDeselect }: SegmentedProps<T>) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const pos = useRef(-1);
  const anim = useRef<SpringHandle | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const cur = options.findIndex(o => o.value === value);
  const shown = preview ?? cur;
  const gesture = useRef<{ onThumb: boolean; i: number; start: number } | null>(null);

  const place = (to: number, animate: boolean) => {
    const el = thumb.current;
    if (!el) return;
    anim.current?.stop();
    if (to < 0) { el.style.opacity = '0'; pos.current = -1; return; }
    el.style.opacity = '1';
    const paint = (v: number) => { pos.current = v; el.style.transform = `translateX(${(v * 100).toFixed(3)}%)`; };
    if (!animate || pos.current < 0 || prefersReducedMotion()) { paint(to); return; }
    anim.current = animateSpring({ from: pos.current, to, ...SPRINGS.thumb, onUpdate: paint });
  };
  useEffect(() => { place(shown, true); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => anim.current?.stop(), []);

  const idxAt = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(options.length - 1, Math.floor(((x - r.left) / r.width) * options.length)));
  };
  const pick = (i: number) => {
    const c = segmentedChoice(options, i, value, !!allowDeselect);
    if (c.change) (onChange as (v: T | undefined) => void)(c.value);
  };

  return (
    <div className="stack" role="radiogroup" aria-label={label}>
      {label && <span className="label">{label}</span>}
      <div className="seg" ref={track} data-no-drag style={{ ['--n' as string]: options.length }}
        onPointerDown={e => {
          if (e.button !== 0) return;
          const i = idxAt(e.clientX);
          gesture.current = { onThumb: i === cur, i, start: i };
          try { track.current!.setPointerCapture(e.pointerId); } catch { /* gone */ }
          if (i === cur) thumb.current?.classList.add('press');
          setPreview(i);
        }}
        onPointerMove={e => {
          const g = gesture.current;
          if (!g) return;
          const i = idxAt(e.clientX);
          if (i !== g.i) { g.i = i; setPreview(i); }
        }}
        onPointerUp={() => {
          const g = gesture.current;
          if (!g) return;
          gesture.current = null;
          thumb.current?.classList.remove('press');
          setPreview(null);
          // Dragging off the selected segment and back is not a tap: only a press and release on it clears.
          if (g.i === cur && g.start !== g.i) return;
          pick(g.i);
        }}
        onPointerCancel={() => { gesture.current = null; thumb.current?.classList.remove('press'); setPreview(null); }}
        onKeyDown={e => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const n = Math.max(0, Math.min(options.length - 1, (cur < 0 ? 0 : cur) + (e.key === 'ArrowRight' ? 1 : -1)));
          pick(n);
          (track.current?.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
        }}>
        <div className="seg-thumb" ref={thumb} aria-hidden="true" />
        {options.map((o, i) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} tabIndex={i === (cur < 0 ? 0 : cur) ? 0 : -1}
            className={`seg-opt${i === shown ? ' on' : ''}`} onClick={e => { if (e.detail === 0) pick(i); }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Toggle

/** On/off switch: a square knob in an ink frame; the knob stretches while held. */
export function Toggle({ label, checked, onChange, hint, disabled }: {
  label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean;
}) {
  const [held, setHeld] = useState(false);
  return (
    <label className="toggle-row" data-no-drag>
      <span className="toggle-text"><span>{label}</span>{hint && <span className="quiet">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} className={`toggle${held ? ' held' : ''}`}
        onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onPointerLeave={() => setHeld(false)}
        onClick={() => onChange(!checked)}>
        <span className="toggle-knob" />
      </button>
    </label>
  );
}
