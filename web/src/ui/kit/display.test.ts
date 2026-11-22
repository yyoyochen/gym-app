import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Legend, ValueRow, stampDate } from './Display';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('ValueRow', () => {
  it('renders key and value in the srow pattern', () => {
    const m = html(h(ValueRow, { k: '01', value: 'Back squat' }));
    expect(m).toBe('<div class="srow"><span class="srow-k">01</span><span class="srow-v">Back squat</span></div>');
  });

  it('wraps value and sub in srow-main, adds right and trailing children', () => {
    const m = html(h(ValueRow, { k: 'Log', value: 'Squat', sub: 'Best e1RM', right: '120', rightMid: true }, h('button', null, 'x')));
    expect(m).toBe('<div class="srow"><span class="srow-k">Log</span><span class="srow-main"><span class="srow-v">Squat</span>'
      + '<span class="srow-sub">Best e1RM</span></span><span class="srow-r mid">120</span><button>x</button></div>');
  });

  it('is a link when given href, and keeps extra classes and data attributes', () => {
    const m = html(h(ValueRow, { href: '#/profile/program', className: 'nav-row', value: 'Program', 'data-press': 'row' }));
    expect(m).toBe('<a class="srow nav-row" href="#/profile/program" data-press="row"><span class="srow-v">Program</span></a>');
  });

  it('puts main content after the sub line', () => {
    const m = html(h(ValueRow, { value: 'Squat', sub: '120 hold', main: h('span', { className: 'srow-bars' }) }));
    expect(m).toContain('<span class="srow-sub">120 hold</span><span class="srow-bars"></span></span>');
  });
});

describe('Legend', () => {
  it('renders children in order inside a label-role strip', () => {
    const m = html(h(Legend, null, h('span', null, 'Less'), h('span', null, 'More')));
    expect(m).toBe('<div class="legend" aria-hidden="true"><span>Less</span><span>More</span></div>');
  });
});

describe('stampDate', () => {
  it('a plain short date, no copyright mark', () => {
    expect(stampDate(new Date(2026, 10, 22))).toBe('Sun 22 Nov');
    expect(stampDate(new Date(2027, 0, 3))).toBe('Sun 3 Jan');
  });
});
