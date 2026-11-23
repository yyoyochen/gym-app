import { describe, expect, it } from 'vitest';
import { LAZY_ASSET, precacheList } from './plugin';

describe('precache list', () => {
  it('leaves the Chinese fonts out (fetched and kept on first use) and keeps everything else', () => {
    const files = precacheList(['assets/index-a1.js', 'assets/zh-sans-b2.woff2', 'assets/zh-pixel-c3.woff2', 'assets/gymbro-glyph-d4.woff2'], ['icon.svg']);
    expect(files).toEqual(['./', 'assets/index-a1.js', 'assets/gymbro-glyph-d4.woff2', 'icon.svg']);
  });
  it('the service worker recognises a Chinese font request', () => {
    expect(new RegExp(LAZY_ASSET).test('/gym-app/assets/zh-sans-b2.woff2')).toBe(true);
    expect(new RegExp(LAZY_ASSET).test('/gym-app/assets/index-a1.js')).toBe(false);
  });
});
