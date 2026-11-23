/**
 * Display-only clean-up of engine text. The engine keeps its exact strings
 * (they're pinned by the Python parity fixtures); every screen that shows a
 * criterion or a reason passes it through here, so Today, the logger, Review
 * and History always show the same words. The result is translated by te()
 * (i18n/engine.ts), so the Chinese table matches these cleaned-up English forms.
 */
import { te } from '../i18n/engine';
export function readable(text: string): string {
  return te(text
    .replace(/\[(\d+(?:\.\d+)?(?:, \d+(?:\.\d+)?)*)\]/g, '$1')        // [8, 8] → 8, 8
    .replace(/(\d(?:kg)?)\s?x\s?(\d)/g, '$1 × $2')                   // 100kg x 2 → 100kg × 2
    .replace(/Log your sets at 0kg — /g, 'Log your sets — ')
    .replace(/(?<!capped )\bat 0kg\b/g, 'at bodyweight')        // a 0 kg jump cap stays 0 kg
    .replace(/\bstay at 0kg\b/g, 'stay at bodyweight'));
}
