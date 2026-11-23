import { describe, expect, it } from 'vitest';
import { isTextEntry } from './keyboard';

describe('isTextEntry: what opens the phone keyboard', () => {
  it('text-like inputs and textareas do', () => {
    for (const type of ['text', 'number', 'search', 'email', 'tel', 'url', 'password', '']) {
      expect(isTextEntry({ tagName: 'INPUT', type, readOnly: false })).toBe(true);
    }
    expect(isTextEntry({ tagName: 'TEXTAREA', readOnly: false })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('buttons, checkboxes, files and read-only fields do not', () => {
    for (const type of ['button', 'checkbox', 'radio', 'file', 'range', 'submit', 'date']) {
      expect(isTextEntry({ tagName: 'INPUT', type, readOnly: false })).toBe(false);
    }
    expect(isTextEntry({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
