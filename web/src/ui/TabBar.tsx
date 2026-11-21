import { PixelIcon } from './kit/PixelIcon';
import type { IconName } from './kit/icons';
import { go } from './kit/navigation';
import { scrollPageTo } from './kit/PageStack';

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'progress', label: 'Progress', icon: 'progress' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
];

/**
 * Four tabs: pixel icon + mono caption, a 1.5px ink rule on top. The active tab
 * is a square accent box around icon and caption: the icon half filled, the
 * caption half outlined, with a dither shadow (kit.css, dither.css).
 * Tab switches are instant (no slide). Re-tapping the active tab
 * scrolls to the top, or returns to the tab's root from a page below it.
 */
export function TabBar({ active, path }: { active: string; path: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(t => {
        const on = active === t.key;
        return (
          <a key={t.key} href={`#/${t.key}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} data-press="dim"
            onClick={e => {
              e.preventDefault();
              if (on && path === t.key) scrollPageTo(0, true);
              else go(t.key, { transition: 'none' });
            }}>
            <span className="tab-box">
              <span className="tab-ico"><PixelIcon name={t.icon} /></span>
              <span className="tab-lbl">{t.label}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}
