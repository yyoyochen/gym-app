import { PixelIcon } from './kit/PixelIcon';
import type { IconName } from './kit/icons';
import { go } from './kit/navigation';
import { scrollPageTo } from './kit/PageStack';
import { t } from '../i18n';

export const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'progress', label: 'Progress', icon: 'progress' },
  { key: 'history', label: 'Calendar', icon: 'calendar' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

/** A tab's caption in the app's language. */
function tabLabel(key: string, label: string): string {
  switch (key) {
    case 'today': return t('Today');
    case 'progress': return t('Progress');
    case 'history': return t('Calendar');
    case 'profile': return t('Profile');
  }
  return label;
}

/**
 * Four tabs: pixel icon + mono caption, a 1.5px ink rule on top. The active tab
 * is a square accent box around icon and caption: the icon half filled, the
 * caption half outlined, with a dither shadow (kit.css, dither.css).
 * Tab switches are instant (no slide). Re-tapping the active tab
 * scrolls to the top, or returns to the tab's root from a page below it.
 */
export function TabBar({ active, path }: { active: string; path: string }) {
  return (
    <nav className="tabbar" aria-label={t('Main')}>
      {TABS.map(tab => {
        const on = active === tab.key;
        return (
          <a key={tab.key} href={`#/${tab.key}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} data-press="dim"
            onClick={e => {
              e.preventDefault();
              if (on && path === tab.key) scrollPageTo(0, true);
              else go(tab.key, { transition: 'none' });
            }}>
            <span className="tab-box">
              <span className="tab-ico"><PixelIcon name={tab.icon} /></span>
              <span className="tab-lbl">{tabLabel(tab.key, tab.label)}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}
