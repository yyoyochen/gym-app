import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseTable, sniffDelimiter } from './csv';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

describe('semicolon CSVs', () => {
  it('sniffs the delimiter from the header line', () => {
    expect(sniffDelimiter(fixture('strong-android.csv'))).toBe(';');
    expect(sniffDelimiter(fixture('strong-android-old.csv'))).toBe(';');
    expect(sniffDelimiter(fixture('hevy-kg.csv'))).toBe(',');
    expect(sniffDelimiter(fixture('strong-ios.csv'))).toBe(',');
  });
  it('parses a quoted semicolon file; a comma inside a quoted field stays in it', () => {
    const t = parseCsv(fixture('strong-android.csv'), ';');
    expect(t[0]).toHaveLength(13);
    expect(t[1][2]).toBe('Full body, B');
  });
  it('commas are the default', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('a spreadsheet re-save that wrapped each row in quotes is unwrapped', () => {
    const t = parseTable(fixture('strong-2018.csv'));
    expect(t[1]).toEqual(['2018-06-27 16:26:53', 'B', 'Squat', '1', '15', '5', '', '0', '', '']);
    expect(t[2]).toHaveLength(10);
  });
});
