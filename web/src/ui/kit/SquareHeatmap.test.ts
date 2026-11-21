import { describe, it, expect } from 'vitest';
import { cellPixels, SUBPIXELS } from './SquareHeatmap';

describe('SquareHeatmap cell dither', () => {
  it('lights 4, 8, 12, 16 of 16 sub-pixels (25/50/75/100%) for the four levels', () => {
    expect([0, 1, 2, 3].map(l => cellPixels(l).length)).toEqual([...SUBPIXELS]);
  });
  it('empty days draw no sub-pixels', () => expect(cellPixels(-1)).toEqual([]));
  it('density only grows: 25% ⊂ 75% ⊂ 100%, and 25% ⊂ 50%', () => {
    const set = (l: number) => new Set(cellPixels(l).map(p => p.join(',')));
    for (const [a, b] of [[0, 2], [2, 3], [0, 1]]) for (const p of set(a)) expect(set(b).has(p)).toBe(true);
  });
});

describe('SquareHeatmap shading is even', () => {
  it('every 2 × 2 block of a level has the same number of lit dots', () => {
    for (let l = 0; l < 4; l++) {
      const lit = new Set(cellPixels(l).map(([x, y]) => `${x},${y}`));
      const sub = cellPixels(3)[1][0]; // width of one sub-pixel
      const counts: number[] = [];
      for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
        let n = 0;
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if (lit.has(`${(bx * 2 + x) * sub},${(by * 2 + y) * sub}`)) n++;
        counts.push(n);
      }
      expect(new Set(counts).size).toBe(1);
    }
  });
});
