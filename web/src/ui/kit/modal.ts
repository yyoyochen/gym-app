// Modal stack shared by Sheet, ActionSheet and PrMoment: the app frame and
// every modal below the top one are inert; only the top one takes Esc/Tab.
export const APP_ROOT_ID = 'app-root';
const stack: HTMLElement[] = [];

function update() {
  const app = document.getElementById(APP_ROOT_ID);
  if (app) app.inert = stack.length > 0;
  stack.forEach((el, i) => { el.inert = i < stack.length - 1; });
}

export function pushModal(el: HTMLElement): void { stack.push(el); update(); }
export function popModal(el: HTMLElement): void {
  const i = stack.indexOf(el);
  if (i >= 0) stack.splice(i, 1);
  el.inert = false;
  update();
}
export function isTopModal(el: HTMLElement | null): boolean { return !!el && stack[stack.length - 1] === el; }

export function appRoot(): HTMLElement | null { return document.getElementById(APP_ROOT_ID); }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab inside `el`. Call from a keydown handler; returns true when it moved focus. */
export function trapTab(e: KeyboardEvent, el: HTMLElement): boolean {
  if (e.key !== 'Tab') return false;
  const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement);
  if (!f.length) { e.preventDefault(); el.focus(); return true; }
  const i = f.indexOf(document.activeElement as HTMLElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); return true; }
  if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); return true; }
  return false;
}

/** Background scale-back for a sheet at its large detent (t: 0 → 1). */
export function setPresentingProgress(t: number): void {
  const app = appRoot();
  if (!app) return;
  if (t <= 0.001) { app.style.transform = ''; document.documentElement.classList.remove('gb-presenting'); return; }
  document.documentElement.classList.add('gb-presenting');
  app.style.transform = `translateY(${(t * 10).toFixed(2)}px) scale(${(1 - 0.07 * t).toFixed(4)})`;
}
