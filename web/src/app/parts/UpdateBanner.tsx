// "Version 0.1.8 is ready. Tap to update (you have 0.1.7)": shown on Today when
// a new version has downloaded. Tapping activates it and reloads; the log is
// untouched. Today hides it while a session is open.
import { useState } from 'react';
import { applyUpdate, useUpdate } from '../../sw/register';
import { updateText } from '../../sw/version';
import { PixelIcon } from '../../ui/kit';

export function UpdateBanner() {
  const { ready, version } = useUpdate();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  const t = updateText(version, __APP_VERSION__);
  return (
    <button type="button" className="update-banner" data-press="dim" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>
      <span className="update-banner-txt">
        <b>{busy ? 'Updating…' : t.title}</b>
        <span>{t.action}</span>
      </span>
      <PixelIcon name="chevron" />
    </button>
  );
}
