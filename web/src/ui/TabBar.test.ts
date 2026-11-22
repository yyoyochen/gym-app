import { describe, expect, it } from 'vitest';
import { TABS } from './TabBar';

describe('tab bar', () => {
  it('the third tab is Calendar with the calendar icon; the route stays #/history', () => {
    expect(TABS.map(t => t.label)).toEqual(['Today', 'Progress', 'Calendar', 'Profile']);
    expect(TABS[2]).toMatchObject({ key: 'history', icon: 'calendar' });
  });
});
