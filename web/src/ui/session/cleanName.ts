/** A session name as saved: trimmed, inner spaces collapsed, 1 to 40 characters; null when it is not a usable name. */
export const SESSION_NAME_MAX = 40;

export function cleanSessionName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  return s.length >= 1 && s.length <= SESSION_NAME_MAX ? s : null;
}
