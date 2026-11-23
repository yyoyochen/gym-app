#!/usr/bin/env python3
"""Checks web/src/styles/fonts/gymbro-glyph.woff2 (run: python3 -I tools/dither/test_glyph_font.py)."""
import os, sys
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT = os.path.join(ROOT, 'web/src/styles/fonts/gymbro-glyph.woff2')
MONO_400 = os.path.join(ROOT, 'node_modules/@fontsource/sometype-mono/files/sometype-mono-latin-400-normal.woff2')
GLYPHS = {0x2591: 0.25, 0x2592: 0.50, 0x2593: 0.75, 0x2588: 1.00}

def rects(font, name):
    g = font['glyf'][name]
    if g.numberOfContours <= 0:
        return []
    coords, ends = g.getCoordinates(font['glyf'])[0], g.endPtsOfContours
    out, start = [], 0
    for end in ends:
        pts = coords[start:end + 1]; start = end + 1
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out

def main():
    assert os.path.exists(FONT), f'missing {FONT}'
    f, sm = TTFont(FONT), TTFont(MONO_400)
    cmap, sm_cmap = f.getBestCmap(), sm.getBestCmap()
    assert set(cmap) == set(GLYPHS), f'cmap {sorted(hex(c) for c in cmap)}'
    adv = sm['hmtx'][sm_cmap[ord('0')]][0]
    asc, desc = sm['hhea'].ascent, sm['hhea'].descent
    assert f['hhea'].ascent == asc and f['hhea'].descent == desc, 'vertical metrics differ from the mono font'
    box = adv * (asc - desc)
    for cp, want in GLYPHS.items():
        name = cmap[cp]
        assert f['hmtx'][name][0] == adv, f'{hex(cp)} advance {f["hmtx"][name][0]} != {adv}'
        rs = rects(f, name)
        cov = sum((x1 - x0) * (y1 - y0) for x0, y0, x1, y1 in rs) / box
        assert abs(cov - want) <= 0.03, f'{hex(cp)} coverage {cov:.3f} != {want}'
        if want < 1:
            assert min(x1 - x0 for x0, _, x1, _ in rs) == adv // 4, f'{hex(cp)} cell is not advance/4'
    assert 'GymBro Glyph' in [n.toUnicode() for n in f['name'].names if n.nameID == 1]
    print('glyph font ok')

if __name__ == '__main__':
    try:
        main()
    except AssertionError as e:
        print('FAIL:', e); sys.exit(1)
