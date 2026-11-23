// What the Storage section says, by platform. Chrome on Android keeps an
// installed app's data without asking, and often refuses in a plain tab; iPhone
// needs the Home Screen. Pure so it can be tested; Settings reads the browser.
import { t } from '../i18n';

export type Platform = 'android' | 'ios' | 'other';

export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const mayClear = () => t('The browser may clear this app’s data under storage pressure.');

export function storageNote(i: { persisted: boolean; installed: boolean; platform: Platform; denied?: boolean }): { text: string; offerRequest: boolean } {
  if (i.persisted) return { text: t('The browser keeps this app’s data.'), offerRequest: false };
  if (i.installed) return { text: mayClear(), offerRequest: true };
  if (i.platform === 'android') return { text: t('Install the app (Add to Home screen) and Chrome keeps your data.'), offerRequest: false };
  if (i.platform === 'ios') return { text: t('On iPhone, add the app to the Home Screen to keep your data.'), offerRequest: false };
  if (i.denied) return { text: t('The browser did not grant it. Installing the app usually helps.'), offerRequest: false };
  return { text: mayClear(), offerRequest: true };
}
