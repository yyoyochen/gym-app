#!/usr/bin/env node
// The gym-app icon: "gym" over "app" in a 5 × 7 pixel font, cream on plum,
// with the app's checker shadow in the accent colour (one half-pixel down-right
// of every letter pixel, never on a letter). Writes the SVGs and PNGs in
// web/public/. No dependencies: PNGs are encoded here with node:zlib.
//   node tools/icons/build.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PLUM = [0x1c, 0x17, 0x24], INK = [0xfe, 0xf8, 0xec], ACCENT = [0xfc, 0xd0, 0xaf];
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

const FONT = {
  g: ['.####', '#...#', '#...#', '#...#', '.####', '....#', '####.'],
  y: ['#...#', '#...#', '#...#', '#...#', '.####', '....#', '####.'],
  m: ['####.', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '.....', '.....'],
  a: ['.###.', '....#', '.####', '#...#', '.####', '.....', '.....'],
  p: ['####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
};
const word = w => FONT[w[0]].map((_, r) => [...w].map(ch => FONT[ch][r]).join('.'));
const GRID = [...word('gym'), '.'.repeat(17), '.'.repeat(17), ...word('app')];
const W = GRID[0].length, H = GRID.length;
const on = (x, y) => y >= 0 && y < H && x >= 0 && x < W && GRID[y][x] === '#';

/** Rectangles for one icon: `cell` px per letter pixel (even), centred on a `size` px tile. */
function rects(size, cell) {
  const half = cell / 2;
  const snap = v => Math.round(v / half) * half;
  const ox = snap((size - W * cell) / 2), oy = snap((size - H * cell) / 2);
  const out = [{ x: 0, y: 0, w: size, h: size, c: PLUM }];
  const seen = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const bx = (ox + x * cell) / half, by = (oy + y * cell) / half;
    for (const k of [1, 2]) for (const j of [1, 2]) {
      const sx = bx + k, sy = by + j, key = `${sx},${sy}`;
      const cx = Math.floor((sx * half - ox) / cell), cy = Math.floor((sy * half - oy) / cell);
      if (!on(cx, cy) && (sx + sy) % 2 === 0 && !seen.has(key)) {
        seen.add(key);
        out.push({ x: sx * half, y: sy * half, w: half, h: half, c: ACCENT });
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (on(x, y)) out.push({ x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, c: INK });
  }
  return out;
}

function svg(size, cell) {
  const body = rects(size, cell).map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${hex(r.c)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${body}</svg>\n`;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

function png(size, cell) {
  const px = Buffer.alloc(size * size * 3);
  for (const r of rects(size, cell)) {
    for (let y = Math.max(0, r.y); y < Math.min(size, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(size, r.x + r.w); x++) px.set(r.c, (y * size + x) * 3);
    }
  }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../../web/public/', import.meta.url);
writeFileSync(new URL('icon.svg', out), svg(512, 22));
writeFileSync(new URL('icon-maskable.svg', out), svg(512, 16)); // smaller, inside Android's round safe zone
writeFileSync(new URL('icon-512.png', out), png(512, 22));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, 16));
writeFileSync(new URL('icon-192.png', out), png(192, 8));
writeFileSync(new URL('apple-touch-icon.png', out), png(180, 8));
console.log('icons written to web/public/');
