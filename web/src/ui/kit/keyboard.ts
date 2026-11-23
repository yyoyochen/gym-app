// Phone keyboard: while a text field has focus, <html> gets .kb-open. CSS hides
// the tab bar and un-pins the sticky footers, so nothing sits on top of the
// field; the field is then scrolled to the middle of what is left visible.
const NO_KEYBOARD = new Set(['button', 'checkbox', 'radio', 'file', 'range', 'submit', 'reset', 'image', 'color', 'date', 'datetime-local', 'month', 'time', 'week', 'hidden']);

interface FocusTarget { tagName?: string; type?: string; readOnly?: boolean; isContentEditable?: boolean }

/** Whether focusing this element opens the on-screen keyboard. */
export function isTextEntry(el: FocusTarget | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return !el.readOnly;
  if (el.tagName === 'INPUT') return !el.readOnly && !NO_KEYBOARD.has((el.type ?? '').toLowerCase());
  return false;
}

/** Call once at startup. */
export function initKeyboardWatch(): void {
  const html = document.documentElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    const el = document.activeElement as HTMLElement | null;
    if (isTextEntry(el)) el!.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  document.addEventListener('focusin', e => {
    if (!isTextEntry(e.target as FocusTarget)) return;
    html.classList.add('kb-open');
    clearTimeout(timer);
    // The keyboard animates in over ~250 ms; scroll once it has settled.
    timer = setTimeout(reveal, 320);
  });
  document.addEventListener('focusout', () => {
    // Focus may be moving to the next field: check once it has landed.
    setTimeout(() => { if (!isTextEntry(document.activeElement as FocusTarget)) html.classList.remove('kb-open'); }, 0);
  });
  window.visualViewport?.addEventListener('resize', () => { if (html.classList.contains('kb-open')) { clearTimeout(timer); timer = setTimeout(reveal, 120); } });
}
