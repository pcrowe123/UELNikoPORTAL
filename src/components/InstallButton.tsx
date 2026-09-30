// "Install" in the top bar: puts the portal on a phone's home screen or a desktop's task bar.
//
// All the judgement lives in `src/engine/install.ts`; this reads the browser's actual values and
// fires the prompt. The button hides itself entirely when there is nothing useful to offer — once
// installed, or in a browser that cannot (PL-09).

import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { installAdvice, installLabel, isIosLike, isStandalone } from '../engine/install';

/**
 * Chrome's `beforeinstallprompt`. It is not in the DOM library because it is not a standard, so
 * the shape it actually has is written out here rather than cast to `any`.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Read once on mount, then keep it current: installing from the browser's own menu flips this
  // without a reload, and the button should disappear when it does.
  useEffect(() => {
    const media = window.matchMedia(STANDALONE_QUERY);
    const read = () =>
      setStandalone(
        isStandalone(
          media.matches,
          (window.navigator as Navigator & { standalone?: boolean }).standalone,
        ),
      );
    read();
    media.addEventListener('change', read);
    return () => media.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    // Caught and kept. The browser fires this once, early, and it can only be used later if the
    // default is prevented — otherwise Chrome shows its own banner and the event is spent.
    const onBeforePrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforePrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforePrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const iosLike = isIosLike(
    window.navigator.userAgent,
    window.navigator.maxTouchPoints,
  );
  const advice = installAdvice({ standalone, canPrompt: !!deferred, iosLike });
  const label = installLabel(advice);

  const install = useCallback(async () => {
    if (advice === 'ios-manual') {
      setShowIosHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Spent either way: the event cannot be fired twice. If they declined, the browser will offer
    // another one on a later visit, and until then there is nothing to show.
    setDeferred(null);
    if (outcome === 'accepted') setStandalone(true);
  }, [advice, deferred]);

  if (!label) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-small install-btn"
        onClick={() => void install()}
        title="Put the portal on your home screen"
      >
        <span aria-hidden="true">⤓</span> <span className="install-btn-label">{label}</span>
      </button>

      {showIosHelp ? (
        <Modal
          title="Add the portal to your home screen"
          onClose={() => setShowIosHelp(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setShowIosHelp(false)}>
              Right you are
            </button>
          }
        >
          <p>
            On an iPhone or iPad this is done from Safari's own menu rather than from a button on the
            page — Apple does not let a website install itself.
          </p>
          <ol className="steps">
            <li>
              Tap <b>Share</b> at the bottom of Safari — the square with an arrow coming out of it.
            </li>
            <li>
              Scroll down the list and tap <b>Add to Home Screen</b>.
            </li>
            <li>
              Tap <b>Add</b>.
            </li>
          </ol>
          <p className="muted small" style={{ marginBottom: 0 }}>
            The portal then sits with your other apps and opens without the browser bars. It has to
            be <b>Safari</b>: Chrome and Firefox on an iPhone cannot add to the home screen.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
