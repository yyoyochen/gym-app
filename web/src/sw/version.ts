// The app's version as people see it: major.minor from package.json, then the
// deploy number (the Pages workflow's run number, passed in as APP_BUILD).
// Every deploy gets a higher number; a local build says "-dev".

export function appVersion(pkgVersion: string, build?: string): string {
  if (!build || !/^\d+$/.test(build)) return `${pkgVersion}-dev`;
  const [major = '0', minor = '0'] = pkgVersion.split('.');
  return `${major}.${minor}.${build}`;
}

/** The update banner's two lines. `next` is null when the new worker didn't say its version. */
export function updateText(next: string | null, current: string): { title: string; action: string } {
  return {
    title: next ? `Version ${next} is ready` : 'A new version is ready',
    action: `Tap to update (you have ${current})`,
  };
}
