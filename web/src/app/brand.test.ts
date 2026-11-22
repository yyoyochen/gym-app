import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const web = fileURLToPath(new URL('../..', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});

describe('the app is just called Gym App', () => {
  it('manifest and page title', () => {
    const m = JSON.parse(readFileSync(join(web, 'public/manifest.webmanifest'), 'utf8'));
    expect([m.name, m.short_name]).toEqual(['Gym App', 'Gym App']);
    expect(readFileSync(join(web, 'index.html'), 'utf8')).toContain('<title>Gym App</title>');
  });
  it('no screen text still says GymBro or ATG (internal names like the glyph font and storage keys may stay)', () => {
    const hits = files(join(web, 'src'))
      .filter(f => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f))
      .flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l] as const))
      .filter(([, , l]) => /GymBro|\bATG\b/.test(l) && !/GymBro Glyph/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    expect(hits.map(([f, n]) => `${f.slice(web.length)}:${n}`)).toEqual([]);
  });
});
