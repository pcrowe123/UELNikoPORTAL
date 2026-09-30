// Whether to offer to install the portal, and how.
//
// Installing is the one thing a launcher really wants: on a phone's home screen it becomes the
// first tap of the morning rather than a bookmark somebody has to find (PL-09).
//
// Pure TypeScript — every browser fact arrives as an argument, so all of this is testable without
// a browser (CLAUDE.md rule 8). `InstallButton.tsx` is the thin part that reads the real values.

/** What the button should do, if it should be there at all. */
export type InstallAdvice =
  /** Already installed, or running as the installed app. Say nothing. */
  | 'installed'
  /** The browser has offered us a prompt to fire. One tap. */
  | 'prompt'
  /** iOS: there is no prompt to fire, so the person is talked through Share → Add to Home Screen. */
  | 'ios-manual'
  /** No prompt and not iOS — the browser cannot install, so do not pretend it can. */
  | 'unavailable';

export interface InstallFacts {
  /** The page is running as an installed app rather than in a browser tab. */
  standalone: boolean;
  /** A `beforeinstallprompt` event has been caught and not yet used. */
  canPrompt: boolean;
  /** iOS or iPadOS, where `beforeinstallprompt` does not exist at all. */
  iosLike: boolean;
}

export function installAdvice({ standalone, canPrompt, iosLike }: InstallFacts): InstallAdvice {
  // Checked first: an installed app can still fire beforeinstallprompt in some browsers, and
  // offering to install something that is already installed makes the portal look broken.
  if (standalone) return 'installed';
  if (canPrompt) return 'prompt';
  if (iosLike) return 'ios-manual';
  return 'unavailable';
}

/**
 * iOS and iPadOS, where Safari has never implemented `beforeinstallprompt` and the only way in is
 * the Share menu.
 *
 * iPadOS 13 and later claim to be "Macintosh" in the user agent, deliberately, so a desktop iPad
 * is indistinguishable from a Mac by UA alone. The touch count is what separates them: a real Mac
 * reports 0 (or 1 with a touch bar), an iPad reports 5. Without this an iPad user gets told their
 * browser cannot install the portal, which is both wrong and unhelpful.
 */
export function isIosLike(userAgent: string, maxTouchPoints: number): boolean {
  const ua = userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return ua.includes('Macintosh') && (maxTouchPoints ?? 0) > 1;
}

/**
 * Is this the installed app rather than a browser tab?
 *
 * Two different mechanisms, because the standard one is not the one iOS implements. Everywhere
 * else it is the `display-mode: standalone` media query; on iOS Safari it is the non-standard
 * `navigator.standalone`. Either being true is enough.
 */
export function isStandalone(displayModeStandalone: boolean, navigatorStandalone?: boolean): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

/** The words on the button, or null when there should be no button. */
export function installLabel(advice: InstallAdvice): string | null {
  switch (advice) {
    case 'prompt':
      return 'Install';
    case 'ios-manual':
      return 'Install';
    case 'installed':
    case 'unavailable':
      return null;
  }
}
