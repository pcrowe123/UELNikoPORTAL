// One application on the landing page.
//
// It is a real anchor, not a button with an onClick, so that middle-click, ctrl-click and
// "copy link address" all behave the way people expect of a launcher.
//
// `rel="noopener noreferrer"` is not decoration. Without `noopener` the page that opens keeps a
// handle on this one through `window.opener` and can navigate it somewhere else; without
// `noreferrer` the portal's address is handed to the site in a header it has no need for (SE-04).

import { hostOf, initials, safeHref, type LinkLike } from '../engine/links';

export function LinkCard({
  link,
  newTab,
  onLaunch,
}: {
  link: LinkLike;
  newTab: boolean;
  onLaunch: (link: LinkLike) => void;
}) {
  const href = safeHref(link.url);
  const badge = initials(link.name);
  const host = hostOf(link.url);

  // A tile whose address the engine will not allow is shown, plainly broken, rather than hidden.
  // A missing tile looks like a portal fault; a tile that says it needs fixing gets fixed (D5).
  if (!href) {
    return (
      <div className="tile tile-broken" aria-label={`${link.name} — address needs fixing`}>
        <span className="tile-badge" style={{ background: 'var(--muted)' }} aria-hidden="true">
          !
        </span>
        <div className="tile-words">
          <b>{link.name}</b>
          <span className="tile-tagline">{link.tagline}</span>
          <span className="tile-host bad">This tile has no usable web address. Ask an administrator.</span>
        </div>
      </div>
    );
  }

  return (
    <a
      className="tile"
      href={href}
      target={newTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={() => onLaunch(link)}
      // Ctrl-click and middle-click do not fire onClick in every browser, so the record of a
      // launch is best-effort by design. The click itself never waits for it (SE-03).
      onAuxClick={(e) => {
        if (e.button === 1) onLaunch(link);
      }}
    >
      <span className="tile-badge" style={{ background: link.colour }} aria-hidden="true">
        {badge}
      </span>
      <div className="tile-words">
        <b>{link.name}</b>
        <span className="tile-tagline">{link.tagline}</span>
        <span className="tile-host">{host}</span>
      </div>
      <span className="tile-go" aria-hidden="true">
        &rarr;
      </span>
    </a>
  );
}
