import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('the button is named by its field label and its value', () => {
    const html = renderToStaticMarkup(createElement(Select<string>, { label: 'Area', value: 'shoulder', onChange: () => {}, options: [{ value: 'neck', label: 'Neck' }, { value: 'shoulder', label: 'Shoulder' }] }));
    const labelId = /<span class="label" id="([^"]+)">Area<\/span>/.exec(html)?.[1];
    expect(labelId).toBeTruthy();
    const by = /aria-labelledby="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(by.split(' ')[0]).toBe(labelId);
    expect(by.split(' ')).toHaveLength(2);
  });
});
