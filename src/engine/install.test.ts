import { describe, expect, it } from 'vitest';
import { installAdvice, installLabel, isIosLike, isStandalone } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_MODERN =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';

describe('isIosLike', () => {
  it('recognises an iPhone', () => {
    expect(isIosLike(IPHONE, 5)).toBe(true);
  });

  it('recognises a modern iPad, which claims to be a Mac', () => {
    // The whole reason the touch count is a parameter. By user agent alone this is a Mac.
    expect(isIosLike(IPAD_MODERN, 5)).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(isIosLike(MAC, 0)).toBe(false);
    // A Mac with a touch bar reports 1; still not an iPad.
    expect(isIosLike(MAC, 1)).toBe(false);
  });

  it('is false for Android and Windows', () => {
    expect(isIosLike(ANDROID, 5)).toBe(false);
    expect(isIosLike(WINDOWS, 0)).toBe(false);
  });

  it('copes with a missing user agent or touch count', () => {
    expect(isIosLike('', 0)).toBe(false);
    expect(isIosLike(undefined as unknown as string, undefined as unknown as number)).toBe(false);
  });
});

describe('isStandalone', () => {
  it('is true from the display-mode media query, as everywhere but iOS reports it', () => {
    expect(isStandalone(true)).toBe(true);
  });

  it('is true from navigator.standalone, which is how iOS reports it', () => {
    expect(isStandalone(false, true)).toBe(true);
  });

  it('is false in an ordinary browser tab', () => {
    expect(isStandalone(false)).toBe(false);
    expect(isStandalone(false, false)).toBe(false);
    expect(isStandalone(false, undefined)).toBe(false);
  });
});

describe('installAdvice', () => {
  it('says nothing at all once it is installed', () => {
    expect(installAdvice({ standalone: true, canPrompt: false, iosLike: false })).toBe('installed');
  });

  it('prefers "installed" over a prompt, even if one is somehow offered', () => {
    // Some browsers still fire beforeinstallprompt inside the installed app. Offering to install
    // something already installed makes the portal look broken.
    expect(installAdvice({ standalone: true, canPrompt: true, iosLike: false })).toBe('installed');
  });

  it('fires the prompt when the browser has given us one', () => {
    expect(installAdvice({ standalone: false, canPrompt: true, iosLike: false })).toBe('prompt');
  });

  it('talks an iPhone through the Share menu, because there is no prompt to fire', () => {
    expect(installAdvice({ standalone: false, canPrompt: false, iosLike: true })).toBe('ios-manual');
  });

  it('offers nothing where the browser cannot install', () => {
    expect(installAdvice({ standalone: false, canPrompt: false, iosLike: false })).toBe('unavailable');
  });
});

describe('installLabel', () => {
  it('labels the two cases that show a button', () => {
    expect(installLabel('prompt')).toBe('Install');
    expect(installLabel('ios-manual')).toBe('Install');
  });

  it('gives nothing to show for the two that do not', () => {
    expect(installLabel('installed')).toBeNull();
    expect(installLabel('unavailable')).toBeNull();
  });
});
