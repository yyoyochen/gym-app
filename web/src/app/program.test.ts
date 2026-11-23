import { describe, expect, it } from 'vitest';
import { blankProgram } from './program';

describe('blankProgram: planning your own from scratch', () => {
  it('is one empty session A in the rotation, no phases, no template', () => {
    const p = blankProgram();
    expect(p.name).toBe('My program');
    expect(p.templateId).toBeUndefined();
    expect(p.sessions).toEqual([{ key: 'A', name: 'Session A', slots: [], minimumSlotIds: [] }]);
    expect(p.rotation).toEqual(['A']);
    expect(p.phases).toEqual([]);
    expect(p.id).toMatch(/\S/);
  });
});
