#!/usr/bin/env python3
"""Generates web/src/styles/fonts/gymbro-glyph.woff2: GymBro's own 4-glyph font
for the dither glyphs ░ ▒ ▓ █ (Space Mono has none of them).

░ ▒ ▓ are the same Bayer 4×4 ordered dither at 25 / 50 / 75% that
tools/dither/build-css.mjs uses for the dither tiles; █ is solid. Advance
width and vertical metrics are copied from Space Mono 400, so glyph strings
line up with the mono text around them. A cell is a quarter of the advance,
so each character holds exactly one Bayer period and adjacent glyphs tile
seamlessly.

  python3 -I tools/dither/build-glyph-font.py \
    node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2 \
    web/src/styles/fonts/gymbro-glyph.woff2
"""
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

B4 = [[(v + 0.5) / 16 for v in row] for row in [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]]
GLYPHS = {'shade.light': (0x2591, 0.25), 'shade.medium': (0x2592, 0.50), 'shade.dark': (0x2593, 0.75), 'block.full': (0x2588, 1.0)}


def rect(pen, x0, y0, x1, y1):
    # Clockwise outer contour (TrueType convention).
    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()


def glyph(adv, asc, desc, cov):
    pen = TTGlyphPen(None)
    if cov >= 1:
        rect(pen, 0, desc, adv, asc)
        return pen.glyph()
    cell = adv // 4
    row = 0
    top = asc
    while top > desc:
        bottom = max(desc, top - cell)
        for col in range(4):
            if cov > B4[row % 4][col]:
                x0 = col * cell
                x1 = adv if col == 3 else x0 + cell
                rect(pen, x0, bottom, x1, top)
        top, row = bottom, row + 1
    return pen.glyph()


def main(src, out):
    sm = TTFont(src)
    upm = sm['head'].unitsPerEm
    adv = sm['hmtx'][sm.getBestCmap()[ord('0')]][0]
    asc, desc = sm['hhea'].ascent, sm['hhea'].descent

    order = ['.notdef'] + list(GLYPHS)
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({cp: name for name, (cp, _) in GLYPHS.items()})
    empty = TTGlyphPen(None).glyph()
    glyphs = {'.notdef': empty, **{name: glyph(adv, asc, desc, cov) for name, (_, cov) in GLYPHS.items()}}
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: (adv, 0) for name in order})
    fb.setupHorizontalHeader(ascent=asc, descent=desc)
    fb.setupNameTable({'familyName': 'GymBro Glyph', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=asc, sTypoDescender=desc, usWinAscent=asc, usWinDescent=-desc, xAvgCharWidth=adv)
    fb.setupPost(isFixedPitch=1)
    fb.font.flavor = 'woff2'
    fb.save(out)
    print(f'wrote {out} (advance {adv}, cell {adv // 4}, upm {upm})')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: build-glyph-font.py <space-mono.woff2> <out.woff2>')
    main(*sys.argv[1:])
