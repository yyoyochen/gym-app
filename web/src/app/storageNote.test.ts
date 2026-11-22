import { describe, expect, it } from 'vitest';
import { detectPlatform, storageNote } from './storageNote';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('detectPlatform', () => {
  it('reads the user agent', () => {
    expect(detectPlatform(ANDROID)).toBe('android');
    expect(detectPlatform(IPHONE)).toBe('ios');
    expect(detectPlatform(DESKTOP)).toBe('other');
  });
});

describe('storageNote', () => {
  it('persisted: the browser keeps the data', () => {
    expect(storageNote({ persisted: true, installed: false, platform: 'other' })).toEqual({ text: 'The browser keeps this app’s data.', offerRequest: false });
  });
  it('installed but not persisted: ask the browser', () => {
    expect(storageNote({ persisted: false, installed: true, platform: 'android' })).toEqual({ text: 'The browser may clear this app’s data under storage pressure.', offerRequest: true });
  });
  it('Android in a tab: install the app, no button', () => {
    expect(storageNote({ persisted: false, installed: false, platform: 'android' })).toEqual({ text: 'Install the app (Add to Home screen) and Chrome keeps your data.', offerRequest: false });
  });
  it('iPhone in a tab: Home Screen advice, no button', () => {
    expect(storageNote({ persisted: false, installed: false, platform: 'ios' })).toEqual({ text: 'On iPhone, add the app to the Home Screen to keep your data.', offerRequest: false });
  });
  it('desktop browser: ask the browser', () => {
    expect(storageNote({ persisted: false, installed: false, platform: 'other' })).toEqual({ text: 'The browser may clear this app’s data under storage pressure.', offerRequest: true });
  });
  it('a denied request says so and points to installing', () => {
    expect(storageNote({ persisted: false, installed: false, platform: 'other', denied: true })).toEqual({ text: 'The browser did not grant it. Installing the app usually helps.', offerRequest: false });
  });
});
