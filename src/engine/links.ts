// The launcher's logic: what a tile is, which tiles are shown, in what order, and - the part that
// matters for safety - what is allowed to become an `href`.
//
// Pure TypeScript. No React, no network, no clock of its own (CLAUDE.md rule 8). That is what
// makes all of it testable, including the rule that keeps a hostile URL out of the page.

/** The shape the engine needs. `backend/types.ts` adds the bookkeeping columns to it. */
export interface LinkLike {
  id: string;
  /** Short stable name used in URLs and audit entries, e.g. `booking`. */
  slug: string;
  /** What the tile is called, e.g. "UEL Niko Booking". */
  name: string;
  /** One line under the name saying what the site is for. */
  tagline: string;
  /** Where the tile goes. Only ever an http(s) address - see `safeHref`. */
  url: string;
  /** Tile accent, `#rrggbb`. */
  colour: string;
  sortOrder: number;
  isActive: boolean;
}

/**
 * The schemes a tile may use. Anything else - `javascript:`, `data:`, `vbscript:`, `file:` - is a
 * way of running code or reading a file in the person's browser under the portal's own origin, so
 * it never becomes an href, however it got into the database.
 *
 * The division of labour: this function refuses dangerous schemes, and the `portal_links_url_https`
 * check constraint in the database refuses anything that is not TLS. Both, always (CLAUDE.md
 * rule 9) - `http:` is allowed here only so that a developer can point a tile at a local dev
 * server while working.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * The address to put in an href, or null if there is not a safe one.
 *
 * A tile whose URL does not survive this is shown as broken rather than silently dropped: a
 * missing tile looks like a portal fault, whereas a tile that says it needs fixing gets fixed.
 */
export function safeHref(url: string): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not an absolute address. A relative one would point back at the portal, which is never
    // what a launcher tile means.
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  // A URL with no host ("https:///x") parses in some runtimes and goes nowhere in all of them.
  if (!parsed.hostname) return null;
  return parsed.toString();
}

/**
 * A tool running on the person's own machine (D19).
 *
 * `http://` is allowed for these and for nothing else. Browsers already treat localhost as a
 * secure context because the request never crosses a network, so there is nothing for TLS to
 * protect; the same cannot be said of `http://anything.uel.ie`, which is what the https rule is
 * really there to stop. The `portal_links_url_scheme` constraint says the same thing in SQL.
 */
export function isLocalhostUrl(url: string): boolean {
  const href = safeHref(url);
  if (!href) return false;
  try {
    const { protocol, hostname } = new URL(href);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** What an admin typed, tidied into something `safeHref` will accept if it possibly can. */
export function normaliseUrl(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  // People paste "uelnikobooking.com". Assume TLS rather than refusing them - except for a local
  // address, where https would be wrong: a dev server almost never has a certificate, so
  // "localhost:5173" means http and assuming otherwise gives a tile that cannot connect.
  const bareIsLocal = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed);
  // "localhost:5173" satisfies the usual scheme test - `localhost:` parses as one - so a bare
  // host with a port was being left exactly as typed and then refused. A colon followed only by
  // digits is a port, never a scheme, and no real scheme is spelt that way.
  const looksLikeHostAndPort = /^[a-z0-9.-]+:\d+(\/|\?|#|$)/i.test(trimmed);
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !looksLikeHostAndPort;
  const withScheme = hasScheme ? trimmed : `${bareIsLocal ? 'http' : 'https'}://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    // A bare host gains a "/" from the URL parser; drop it again so the stored value reads the
    // way the person typed it. A real path is left exactly as it is.
    return parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? `${parsed.protocol}//${parsed.host}`
      : parsed.toString();
  } catch {
    return trimmed;
  }
}

/** The host as a person would say it, for the small print on a tile. */
export function hostOf(url: string): string {
  const href = safeHref(url);
  if (!href) return '';
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Two letters for the tile badge: initials of the distinctive words, not of "UEL" and "Niko". */
export function initials(name: string): string {
  const skip = new Set(['uel', 'niko', 'the', 'and', '/', '&']);
  const words = (name ?? '')
    .split(/[\s/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const distinctive = words.filter((w) => !skip.has(w.toLowerCase()));
  const chosen = distinctive.length ? distinctive : words;
  if (!chosen.length) return '?';
  if (chosen.length === 1) return chosen[0].slice(0, 2).toUpperCase();
  return (chosen[0][0] + chosen[1][0]).toUpperCase();
}

/** Tile order: what the admin set, then alphabetically so it never shuffles between loads. */
export function sortLinks<T extends LinkLike>(links: readonly T[]): T[] {
  return [...links].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'en-IE'),
  );
}

/** The tiles to show. Retired ones are kept in the table but never put on the landing page. */
export function visibleLinks<T extends LinkLike>(
  links: readonly T[],
  { includeHidden = false }: { includeHidden?: boolean } = {},
): T[] {
  return sortLinks(includeHidden ? links : links.filter((l) => l.isActive));
}

/**
 * Filter by what was typed in the search box. Matches the name, the tagline and the host, so
 * both "stock" and "uelnikostock" find the same tile. Empty query means everything.
 */
export function searchLinks<T extends LinkLike>(links: readonly T[], query: string): T[] {
  const needle = (query ?? '').trim().toLowerCase();
  if (!needle) return [...links];
  return links.filter((l) =>
    `${l.name} ${l.tagline} ${hostOf(l.url)} ${l.slug}`.toLowerCase().includes(needle),
  );
}

/** A slug from a name, for a tile an admin adds without typing one. */
export function slugify(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** What is wrong with a tile an admin is trying to save, or null if nothing is. */
export function describeLinkProblem(link: {
  name: string;
  url: string;
  colour: string;
}): string | null {
  if (!link.name.trim()) return 'Give the tile a name.';
  if (!link.url.trim()) return 'Give the tile a web address.';
  const href = safeHref(link.url);
  if (!href) return 'That is not a web address. It has to start with https:// and have a host.';
  // http is allowed only for a tool on this machine (D19); everywhere else it would put a real
  // person's session on the office network in clear text.
  if (!/^https:\/\//i.test(href) && !isLocalhostUrl(href)) {
    return 'Use an https:// address. Only localhost may be plain http, and only because it never leaves this machine.';
  }
  if (!/^#[0-9a-f]{6}$/i.test(link.colour.trim())) return 'The colour has to look like #0f4c81.';
  return null;
}
