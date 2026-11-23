// The Chinese font files are not precached (English users never need them).
// In Chinese, ask the browser for them once at start: the service worker keeps
// each file the first time it is fetched (sw-template.js), so they work offline.
let warmed = false;
export function warmZhFonts(): void {
  if (warmed || typeof document === 'undefined' || !document.fonts) return;
  warmed = true;
  void Promise.all([
    document.fonts.load("400 16px 'Gym Sans TC'", '訓'),
    document.fonts.load("800 16px 'Gym Sans TC'", '訓'),
    document.fonts.load("400 11px 'Gym Pixel TC'", '訓'),
  ]).catch(() => {});
}
