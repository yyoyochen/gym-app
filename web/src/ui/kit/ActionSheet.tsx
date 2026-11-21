// Action sheet (HIG confirm): slides up on a spring; press anywhere on it and
// slide across the buttons, release picks the highlighted one. Destructive
// actions are ink with a dashed outline and explicit wording, never red.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SPRINGS, animateSpring, type SpringHandle } from './motion/spring';
import { isTopModal, popModal, pushModal, trapTab } from './modal';

export interface ActionSheetAction {
  label: string;
  onSelect: () => void | Promise<void>;
  destructive?: boolean;
}

export interface ActionSheetProps {
  open: boolean;
  title?: ReactNode;
  message?: ReactNode;
  actions: ActionSheetAction[];
  cancelLabel?: string;
  onClose: () => void;
}

export function ActionSheet(props: ActionSheetProps) {
  const [mounted, setMounted] = useState(props.open);
  useEffect(() => { if (props.open) setMounted(true); }, [props.open]);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<ActionPanel {...props} onGone={() => setMounted(false)} />, document.body);
}

function ActionPanel({ open, title, message, actions, cancelLabel = 'Cancel', onClose, onGone }: ActionSheetProps & { onGone: () => void }) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), dim = useRef<HTMLDivElement>(null);
  const anim = useRef<SpringHandle | null>(null);
  const y = useRef(0);
  const [hl, setHl] = useState<number | null>(null);
  const opener = useRef<Element | null>(null);
  const picked = useRef<(() => void) | null>(null);

  const paint = (v: number) => {
    y.current = v;
    const h = panel.current?.offsetHeight || 1;
    if (panel.current) panel.current.style.transform = `translate3d(0, ${v.toFixed(2)}px, 0)`;
    if (dim.current) dim.current.style.opacity = String(Math.max(0, Math.min(1, 1 - v / h)));
  };

  useLayoutEffect(() => {
    const el = root.current!;
    if (open) {
      opener.current = document.activeElement;
      pushModal(el);
      paint(panel.current!.offsetHeight + 16);
      anim.current?.stop();
      anim.current = animateSpring({ from: y.current, to: 0, ...SPRINGS.sheet, onUpdate: paint });
      panel.current!.querySelector<HTMLButtonElement>('[data-act]')?.focus({ preventScroll: true });
      return;
    }
    popModal(el);
    anim.current?.stop();
    anim.current = animateSpring({
      from: y.current, to: (panel.current?.offsetHeight ?? 300) + 16, ...SPRINGS.sheetDismiss, onUpdate: paint,
      onDone: () => { const run = picked.current; picked.current = null; onGone(); run?.(); },
    });
    const o = opener.current as HTMLElement | null;
    if (o?.isConnected) o.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { if (root.current) popModal(root.current); anim.current?.stop(); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isTopModal(root.current)) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (panel.current) trapTab(e, panel.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const choose = (i: number | 'cancel') => {
    if (i !== 'cancel') { const a = actions[i]; picked.current = () => { void a.onSelect(); }; }
    onClose();
  };
  // slide-to-select
  const press = useRef(false);
  const at = (x: number, yy: number): number | 'cancel' | null => {
    const b = document.elementFromPoint(x, yy)?.closest<HTMLElement>('[data-act]');
    if (!b || !root.current?.contains(b)) return null;
    return b.dataset.act === 'cancel' ? 'cancel' : Number(b.dataset.act);
  };
  const toHl = (v: number | 'cancel' | null) => setHl(v === null ? null : v === 'cancel' ? -1 : v);

  return (
    <div className="asheet-root" ref={root}>
      <div className="asheet-dim" ref={dim} onClick={() => onClose()} />
      <div className="asheet" ref={panel} role="alertdialog" aria-modal="true"
        onPointerDown={e => { if (e.button !== 0) return; press.current = true; try { panel.current?.setPointerCapture(e.pointerId); } catch { /* gone */ } toHl(at(e.clientX, e.clientY)); }}
        onPointerMove={e => { if (press.current) toHl(at(e.clientX, e.clientY)); }}
        onPointerUp={e => { if (!press.current) return; press.current = false; const v = at(e.clientX, e.clientY); setHl(null); if (v !== null) choose(v); }}
        onPointerCancel={() => { press.current = false; setHl(null); }}>
        <div className="asheet-group">
          {(title || message) && (
            <div className="asheet-head">
              {title && <b className="asheet-title">{title}</b>}
              {message && <span className="asheet-msg">{message}</span>}
            </div>
          )}
          {actions.map((a, i) => (
            <button key={a.label} type="button" data-act={i} className={`asheet-btn${a.destructive ? ' destructive' : ''}${hl === i ? ' hl' : ''}`}
              onClick={e => { if (e.detail === 0) choose(i); }}>{a.label}</button>
          ))}
        </div>
        <button type="button" data-act="cancel" className={`asheet-btn cancel${hl === -1 ? ' hl' : ''}`}
          onClick={e => { if (e.detail === 0) choose('cancel'); }}>{cancelLabel}</button>
      </div>
    </div>
  );
}

/**
 * Button that asks before an irreversible action, via an action sheet.
 * Same props as the old two-tap ConfirmButton. `confirmLabel` is the
 * question; legacy "Tap again to …" wording is turned into "… ?".
 */
export function ConfirmButton({ children, confirmLabel = 'Are you sure?', confirmText, message, onConfirm, danger, className = '', disabled }: {
  children: ReactNode; confirmLabel?: string; /** Text of the confirming action (default: the button's own text). */ confirmText?: string;
  message?: ReactNode; onConfirm: () => void | Promise<void>; danger?: boolean; className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionText = confirmText ?? (typeof children === 'string' ? children : 'Confirm');
  return (
    <>
      <button type="button" disabled={disabled || busy} className={`btn ${danger ? 'danger' : ''} ${className}`} onClick={() => setOpen(true)}>{children}</button>
      <ActionSheet open={open} title={confirmQuestion(confirmLabel)} message={message} onClose={() => setOpen(false)}
        actions={[{ label: actionText, destructive: danger, onSelect: async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } } }]} />
    </>
  );
}

/** "Tap again to wipe everything" → "Wipe everything?"; other text unchanged. */
export function confirmQuestion(label: string): string {
  const m = /^tap again to (.+)$/i.exec(label.trim());
  if (!m) return label;
  const q = m[1].replace(/[.!?]+$/, '');
  return q.charAt(0).toUpperCase() + q.slice(1) + '?';
}
