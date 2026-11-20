import { useEffect, useState } from 'react';

// Hash routing: works on GitHub Pages sub-paths with no server rewrites.
export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'today').split('/').map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path: string) {
  location.hash = '#/' + path.replace(/^\//, '');
}
