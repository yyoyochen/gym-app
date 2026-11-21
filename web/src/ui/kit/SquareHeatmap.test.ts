import { describe, it, expect } from 'vitest';
import { cellPixels, SUBPIXELS } from './SquareHeatmap';

describe('SquareHeatmap cell dither', () => {
  it('lights 2, 4, 6, 9 of 9 sub-pixels for the four levels', () => {
    expect([0, 1, 2, 3].map(l => cellPixels(l).length)).toEqual([...SUBPIXELS]);
  });
  it('empty days draw no sub-pixels', () => expect(cellPixels(-1)).toEqual([]));
  it('each level contains the previous one (density only grows)', () => {
    for (let l = 1; l < 4; l++) {
      const prev = new Set(cellPixels(l - 1).map(p => p.join(',')));
      const cur = new Set(cellPixels(l).map(p => p.join(',')));
      for (const p of prev) expect(cur.has(p)).toBe(true);
    }
  });
});
