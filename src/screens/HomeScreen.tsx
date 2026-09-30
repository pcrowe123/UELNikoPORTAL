// The landing page: every application, one click each. This is the whole portal (SPECIFICATION §1).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinkCard } from '../components/LinkCard';
import { canLaunch, lockedReason } from '../engine/access';
import { searchLinks, visibleLinks, type LinkLike } from '../engine/links';
import type { PortalLink } from '../backend/types';
import { useApp } from '../state/AppContext';
import { useToast } from '../components/Toast';

export function HomeScreen() {
  const { backend, user, isAdmin, settings } = useApp();
  const toast = useToast();

  const [links, setLinks] = useState<PortalLink[] | null>(null);
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    // Both together: a tile drawn before its grants have arrived would flash a padlock at
    // somebody who does have access, which looks like the portal changing its mind.
    void Promise.all([backend.listLinks(), backend.listMyAccess()])
      .then(([rows, mine]) => {
        if (!live) return;
        setLinks(rows);
        setGranted(new Set(mine));
      })
      .catch((err: Error) => {
        if (live) setFailure(err.message);
      });
    return () => {
      live = false;
    };
  }, [backend]);

  const shown = useMemo(() => {
    const all = visibleLinks(links ?? []);
    return settings.showSearch ? searchLinks(all, query) : all;
  }, [links, query, settings.showSearch]);

  const onLaunch = useCallback(
    (link: LinkLike) => {
      // Deliberately not awaited: the browser is already following the link, and a slow or failed
      // audit write must never delay or block it (SE-03).
      void backend.recordLaunch(link.slug);
    },
    [backend],
  );

  const isLocked = useCallback(
    (link: PortalLink) =>
      !canLaunch({ mode: link.accessMode, granted: granted.has(link.id), isAdmin }),
    [granted, isAdmin],
  );

  const onBlocked = useCallback(
    (link: LinkLike) => {
      const why = lockedReason({ mode: 'invite', granted: false, isAdmin: false });
      toast.say(`${link.name}: ${why}`);
    },
    [toast],
  );

  const lockedShown = shown.filter(isLocked).length;
  const firstName = user?.displayName.split(/\s+/)[0] ?? '';

  return (
    <div>
      <div className="screen-head">
        <div>
          <h1>{firstName ? `Good to see you, ${firstName}.` : 'Applications'}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {settings.welcome}
          </p>
        </div>
        <span className="spacer" />
        {settings.showSearch && (links?.length ?? 0) > 4 ? (
          <div className="field" style={{ marginBottom: 0, minWidth: 200 }}>
            <label htmlFor="tile-search" className="visually-hidden">
              Search the applications
            </label>
            <input
              id="tile-search"
              type="text"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        ) : null}
      </div>

      {failure ? (
        <div className="banner banner-error">
          The application list would not load: {failure}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setFailure(null);
              setLinks(null);
              void backend
                .listLinks()
                .then(setLinks)
                .catch((err: Error) => {
                  setFailure(err.message);
                  toast.bad('Still not loading.');
                });
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {links === null && !failure ? <p className="muted">Loading…</p> : null}

      {links !== null && shown.length === 0 ? (
        <div className="empty">
          {query
            ? `Nothing matches "${query}".`
            : 'There are no applications on the portal yet. An administrator adds them on the Admin screen.'}
        </div>
      ) : null}

      <div className="tiles">
        {shown.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            newTab={settings.openInNewTab}
            locked={isLocked(link)}
            onLaunch={onLaunch}
            onBlocked={onBlocked}
          />
        ))}
      </div>

      {links !== null && shown.length > 0 ? (
        <p className="tiny muted" style={{ marginTop: 18 }}>
          Each application asks you to sign in with its own account. Signing out of the portal does
          not sign you out of them.
          {lockedShown > 0 ? (
            <>
              {' '}
              {lockedShown === 1 ? 'One application is' : `${lockedShown} applications are`} padlocked
              because you have not been given {lockedShown === 1 ? 'it' : 'them'} yet — ask an
              administrator.
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
