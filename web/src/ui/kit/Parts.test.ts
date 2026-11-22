import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Parts } from './Parts';

describe('Parts', () => {
  it('screen readers hear a comma between parts; sighted users see only the gap', () => {
    const html = renderToStaticMarkup(createElement(Parts, { items: ['100 × 2', '80 × 8'] }));
    expect(html).toContain('<span class="part">100 × 2</span><span class="sr-only">, </span><span class="part">80 × 8</span>');
    expect(html).not.toContain('·');
  });
});
