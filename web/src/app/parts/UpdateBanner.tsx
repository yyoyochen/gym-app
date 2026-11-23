// "Version 0.1.8 is ready. Tap to update (you have 0.1.7)": shown on Today when
// a new version has downloaded. Tapping activates it and reloads; the log is
// untouched. Today hides it while a session is open.
import { useState } from 'react';
import { applyUpdate, useUpdate } from '../../sw/register';
import { updateText } from '../../sw/version';
import { PixelIcon } from '../../ui/kit';
import { t } from '../../i18n';

export function UpdateBanner() {
  const { ready, version } = useUpdate();
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  const text = updateText(version, __APP_VERSION__, t);
  return (
    <button type="button" className="update-banner" data-press="dim" disabled={busy} onClick={() => { setBusy(true); applyUpdate(); }}>
      <span className="update-banner-txt">
        <b>{busy ? t('Updating…') : text.title}</b>
        <span>{text.action}</span>
      </span>
      <PixelIcon name="chevron" />
    </button>
  );
}
