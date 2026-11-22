import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE_ROLES } from '../ui/kit/typeRoles';

const dir = __dirname;
const tokens = readFileSync(resolve(dir, 'tokens.css'), 'utf8');
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim();

describe('design tokens', () => {
  it('every role has a font and a track token', () => {
    expect(TYPE_ROLES).toHaveLength(16);
    for (const { role } of TYPE_ROLES) {
      expect(token(`--text-${role}`), role).toBeTruthy();
      expect(token(`--track-${role}`), role).toBeTruthy();
    }
  });

  it('role specs match the spec', () => {
    expect(token('--text-value')).toBe('650 17px/1.25 var(--font-sans)');
    expect(token('--track-value')).toBe('-0.01em');
    expect(token('--text-num-md')).toBe('700 22px/1.05 var(--font-sans)');
    expect(token('--text-num-xl')).toBe('800 56px/0.86 var(--font-sans)');
    expect(token('--text-quiet')).toBe('400 13px/1.35 var(--font-sans)');
    expect(token('--text-stamp')).toBe('700 11px/1 var(--font-mono)');
    expect(token('--track-stamp')).toBe('0.1em');
    expect(token('--text-micro')).toBe('400 10px/1.2 var(--font-mono)');
  });

  it('old names are gone', () => {
    const old = /--text-num-sm\b|--text-heading\b|--text-large-title\b|--space-(5|7|10)\b|--tracking-/;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.css'))) {
      expect(readFileSync(resolve(dir, f), 'utf8'), f).not.toMatch(old);
    }
  });

  it('section is 28px', () => {
    expect(token('--section')).toBe('28px');
  });
});

describe('glyph font', () => {
  it('glyph font is first in --font-glyph', () => {
    expect(tokens).toContain("font-family: 'GymBro Glyph'");
    expect(tokens).toContain('unicode-range: U+2588, U+2591-2593');
    expect(tokens).toMatch(/--font-glyph: 'GymBro Glyph',/);
  });
});

describe('docs and gallery', () => {
  it('docs and gallery cover every role', () => {
    const root = resolve(__dirname, '../../..');
    const design = readFileSync(resolve(root, 'docs/DESIGN.md'), 'utf8');
    for (const { role } of TYPE_ROLES) expect(design, role).toContain(`\`${role}\``);
    expect(readFileSync(resolve(root, 'web/src/dev/KitGallery.tsx'), 'utf8')).toMatch(/import \{[^}]*TYPE_ROLES[^}]*\}/);
    expect(existsSync(resolve(root, 'docs/design-tokens.css'))).toBe(false);
  });
});
