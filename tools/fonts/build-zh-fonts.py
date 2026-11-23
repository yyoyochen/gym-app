#!/usr/bin/env python3
"""Builds the Chinese fonts, cut down to the characters gym-app's own text uses.

Every CJK character in web/src (non-test .ts/.tsx: the zh/ dictionaries, dates,
the language switch) goes into web/src/styles/fonts/zh-chars.txt, then:

  zh-sans.woff2   Noto Sans TC (variable, weights 100-900), behind Schibsted Grotesk
  zh-pixel.woff2  Cubic 11 (俐方體11號, pixel), behind Sometype Mono

Both are SIL Open Font License. Sources are downloaded once to
~/.cache/gymbro-fonts. Characters outside the subset (a lift name typed in
Chinese) fall back to the phone's own Chinese font. Re-run after adding Chinese
text; web/src/i18n/fonts.test.ts fails until you do.

  python3 -I tools/fonts/build-zh-fonts.py
"""
import os, re, sys, urllib.request
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'web' / 'src'
OUT = SRC / 'styles' / 'fonts'
CACHE = Path.home() / '.cache' / 'gymbro-fonts'
SOURCES = {
    'NotoSansTC-VF.ttf': 'https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf',
    'Cubic_11.ttf': 'https://cdn.jsdelivr.net/gh/ACh-K/Cubic-11@main/fonts/ttf/Cubic_11.ttf',
}
CJK = re.compile(r'[　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]')


def chars() -> str:
    found = set()
    for p in SRC.rglob('*'):
        if p.suffix in ('.ts', '.tsx') and '.test.' not in p.name:
            found.update(CJK.findall(p.read_text(encoding='utf-8')))
    return ''.join(sorted(found))


def source(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / name
    if not p.exists():
        print(f'downloading {name}')
        urllib.request.urlretrieve(SOURCES[name], p)
    return p


def build(src: Path, out: Path, text: str) -> None:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the licence
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    subset.save_font(font, str(out), opts)
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB')


def main() -> None:
    text = chars()
    (OUT / 'zh-chars.txt').write_text(text + '\n', encoding='utf-8')
    print(f'{len(text)} characters')
    build(source('NotoSansTC-VF.ttf'), OUT / 'zh-sans.woff2', text)
    build(source('Cubic_11.ttf'), OUT / 'zh-pixel.woff2', text)


if __name__ == '__main__':
    main()
