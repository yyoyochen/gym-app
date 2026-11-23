import { describe, it, expect } from 'vitest';
import { cellPixels, SUBPIXELS, CELL_DIV } from './SquareHeatmap';

describe('SquareHeatmap cell dither', () => {
  it('lights 8, 16, 24, 32 of 32 sub-pixels (25/50/75/100%) for the four levels', () => {
    expect([0, 1, 2, 3].map(l => cellPixels(l).length)).toEqual([...SUBPIXELS]);
  });
  it('empty days draw no sub-pixels', () => expect(cellPixels(-1)).toEqual([]));
  it('▓ is exactly ░ inverted, and █ is everything', () => {
    const key = (l: number) => new Set(cellPixels(l).map(p => p.join(',')));
    const light = key(0), dark = key(2), full = key(3);
    for (const p of full) expect(light.has(p) !== dark.has(p)).toBe(true);
  });
});

describe('SquareHeatmap shading is even', () => {
  it('every 2 × 2 block of a level has the same number of lit dots', () => {
    const { x: DX, y: DY, sub } = CELL_DIV;
    for (let l = 0; l < 4; l++) {
      const lit = new Set(cellPixels(l).map(([x, y]) => `${x / sub},${y / sub}`));
      const counts: number[] = [];
      for (let by = 0; by < DY; by += 2) for (let bx = 0; bx < DX; bx += 2) {
        let n = 0;
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) if (lit.has(`${bx + x},${by + y}`)) n++;
        counts.push(n);
      }
      expect(new Set(counts).size).toBe(1);
    }
  });
});

describe('SquareHeatmap square cells (the Calendar hero)', () => {
  it('an 8 × 8 cell lights 25/50/75/100% of its 64 sub-pixels', () => {
    expect([0, 1, 2, 3].map(l => cellPixels(l, 'square').length)).toEqual([16, 32, 48, 64]);
  });
  it('the pattern stays inside the cell', () => {
    for (const [x, y] of cellPixels(3, 'square')) { expect(x).toBeLessThan(16); expect(y).toBeLessThan(16); }
  });
});
