const TABS: { key: string; label: string; icon: JSX.Element }[] = [
  { key: 'today', label: 'Today', icon: <path d="M4 12h4l3-8 4 16 3-8h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> },
  { key: 'progress', label: 'Progress', icon: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> },
  { key: 'history', label: 'History', icon: <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /> },
  { key: 'profile', label: 'Profile', icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> },
];

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(t => (
        <a key={t.key} href={`#/${t.key}`} className={active === t.key ? 'on' : ''} aria-current={active === t.key ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
