import { describe, expect, it } from 'vitest';
import {
  describeLinkProblem,
  isLocalhostUrl,
  hostOf,
  initials,
  normaliseUrl,
  safeHref,
  searchLinks,
  slugify,
  sortLinks,
  visibleLinks,
  type LinkLike,
} from './links';

const link = (over: Partial<LinkLike> = {}): LinkLike => ({
  id: 'id',
  slug: 'booking',
  name: 'UEL Niko Booking',
  tagline: 'Meeting rooms and the boardroom.',
  url: 'https://uelnikobooking.com',
  colour: '#0f4c81',
  sortOrder: 1,
  isActive: true,
  ...over,
});

describe('safeHref', () => {
  it('accepts the addresses of the real sites', () => {
    expect(safeHref('https://uelnikobooking.com')).toBe('https://uelnikobooking.com/');
    expect(safeHref('https://uelnikostock.com/check')).toBe('https://uelnikostock.com/check');
  });

  it('allows http, for a dev server only - the database still demands TLS', () => {
    expect(safeHref('http://localhost:5173')).toBe('http://localhost:5173/');
  });

  it('refuses every scheme that could run code or read a file', () => {
    // These are the whole reason the function exists. A tile URL is admin-supplied data that
    // lands in an href, so a scheme check has to stand between the two.
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    expect(safeHref('  javascript:alert(1)  ')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('file:///C:/Windows/win.ini')).toBeNull();
  });

  it('refuses a relative address, which would point back at the portal', () => {
    expect(safeHref('/admin')).toBeNull();
    expect(safeHref('uelnikobooking.com')).toBeNull();
  });

  it('refuses empty and absent values', () => {
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
    expect(safeHref(undefined as unknown as string)).toBeNull();
  });
});

describe('isLocalhostUrl', () => {
  it('recognises the local machine, with or without a port', () => {
    expect(isLocalhostUrl('http://localhost:5173')).toBe(true);
    expect(isLocalhostUrl('http://localhost')).toBe(true);
    expect(isLocalhostUrl('http://127.0.0.1:3001/app')).toBe(true);
    expect(isLocalhostUrl('https://localhost:8443')).toBe(true);
  });

  it('is not fooled by a hostname that merely starts with localhost', () => {
    // The whole reason the database constraint spells out the boundary after the host.
    expect(isLocalhostUrl('http://localhost.evil.test')).toBe(false);
    expect(isLocalhostUrl('http://localhostage.com')).toBe(false);
    expect(isLocalhostUrl('http://127.0.0.1.evil.test')).toBe(false);
  });

  it('is false for real hosts and for rubbish', () => {
    expect(isLocalhostUrl('https://uelnikoiq.com')).toBe(false);
    expect(isLocalhostUrl('javascript:alert(1)')).toBe(false);
    expect(isLocalhostUrl('')).toBe(false);
  });
});

describe('normaliseUrl', () => {
  it('assumes https when someone pastes a bare host', () => {
    expect(normaliseUrl('uelnikoiq.com')).toBe('https://uelnikoiq.com');
    expect(normaliseUrl('  uelnikoiq.com  ')).toBe('https://uelnikoiq.com');
  });

  it('leaves a full address alone, without a trailing slash on a bare host', () => {
    expect(normaliseUrl('https://uelnikoiq.com')).toBe('https://uelnikoiq.com');
    expect(normaliseUrl('https://uelnikoiq.com/')).toBe('https://uelnikoiq.com');
  });

  it('keeps a real path, query and fragment', () => {
    expect(normaliseUrl('https://uelnikostock.com/check?bin=4')).toBe(
      'https://uelnikostock.com/check?bin=4',
    );
  });

  it('does not invent a scheme for something that already has one', () => {
    // Left as typed so describeLinkProblem can refuse it with a sentence, rather than being
    // quietly turned into https://javascript:...
    expect(normaliseUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('assumes http, not https, for a bare local address', () => {
    // A dev server has no certificate, so https://localhost:5173 is a tile that cannot connect.
    expect(normaliseUrl('localhost:5173')).toBe('http://localhost:5173');
    expect(normaliseUrl('127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
  });

  it('still assumes https for a bare host that only looks local', () => {
    expect(normaliseUrl('localhostage.com')).toBe('https://localhostage.com');
  });

  it('does not mistake a port for a scheme', () => {
    // "localhost:5173" satisfies the usual scheme test, which used to leave it exactly as typed
    // and then refuse it. Any host:port had the same problem.
    expect(normaliseUrl('uelnikoiq.com:8080')).toBe('https://uelnikoiq.com:8080');
    expect(normaliseUrl('uelnikoiq.com:8080/orders')).toBe('https://uelnikoiq.com:8080/orders');
  });

  it('gives back nothing for nothing', () => {
    expect(normaliseUrl('')).toBe('');
  });
});

describe('hostOf', () => {
  it('drops the scheme, the path and a leading www', () => {
    expect(hostOf('https://www.uelnikocrm.com/reps')).toBe('uelnikocrm.com');
    expect(hostOf('https://uelnikopos.com')).toBe('uelnikopos.com');
  });

  it('is empty for anything safeHref refuses', () => {
    expect(hostOf('javascript:alert(1)')).toBe('');
    expect(hostOf('')).toBe('');
  });
});

describe('initials', () => {
  it('skips UEL and Niko, which every tile shares', () => {
    expect(initials('UEL Niko Booking')).toBe('BO');
    expect(initials('UEL Niko Stock Management')).toBe('SM');
    expect(initials('UEL / Niko IQ')).toBe('IQ');
  });

  it('falls back to the words it has when they are all skipped', () => {
    expect(initials('UEL Niko')).toBe('UN');
    expect(initials('Niko')).toBe('NI');
  });

  it('copes with punctuation and emptiness', () => {
    expect(initials('Proof-of-Delivery')).toBe('PR');
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('sortLinks and visibleLinks', () => {
  it('orders by the admin order, then by name', () => {
    const links = [
      link({ id: 'c', name: 'Charlie', sortOrder: 2 }),
      link({ id: 'b', name: 'Bravo', sortOrder: 1 }),
      link({ id: 'a', name: 'Alpha', sortOrder: 1 }),
    ];
    expect(sortLinks(links).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not change the array it was given', () => {
    const links = [link({ id: 'b', sortOrder: 2 }), link({ id: 'a', sortOrder: 1 })];
    sortLinks(links);
    expect(links.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('leaves retired tiles off the landing page but finds them for the admin', () => {
    const links = [link({ id: 'on' }), link({ id: 'off', isActive: false })];
    expect(visibleLinks(links).map((l) => l.id)).toEqual(['on']);
    expect(visibleLinks(links, { includeHidden: true }).map((l) => l.id).sort()).toEqual([
      'off',
      'on',
    ]);
  });
});

describe('searchLinks', () => {
  const links = [
    link({ id: 'booking', name: 'UEL Niko Booking', tagline: 'Meeting rooms.' }),
    link({
      id: 'stock',
      name: 'UEL Niko Stock',
      tagline: 'Warehouse stock checking.',
      url: 'https://uelnikostock.com',
      slug: 'stock',
    }),
  ];

  it('returns everything for an empty query', () => {
    expect(searchLinks(links, '')).toHaveLength(2);
    expect(searchLinks(links, '   ')).toHaveLength(2);
  });

  it('matches the name, the tagline and the host', () => {
    expect(searchLinks(links, 'booking').map((l) => l.id)).toEqual(['booking']);
    expect(searchLinks(links, 'warehouse').map((l) => l.id)).toEqual(['stock']);
    expect(searchLinks(links, 'uelnikostock').map((l) => l.id)).toEqual(['stock']);
  });

  it('ignores case', () => {
    expect(searchLinks(links, 'BOOKING').map((l) => l.id)).toEqual(['booking']);
  });

  it('finds nothing when nothing matches', () => {
    expect(searchLinks(links, 'payroll')).toEqual([]);
  });
});

describe('slugify', () => {
  it('makes a url-safe name', () => {
    expect(slugify('UEL Niko Stock Management')).toBe('uel-niko-stock-management');
    expect(slugify('Proof of Delivery!')).toBe('proof-of-delivery');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Órla')).toBe('orla');
  });
});

describe('describeLinkProblem', () => {
  const ok = { name: 'UEL Niko Booking', url: 'https://uelnikobooking.com', colour: '#0f4c81' };

  it('is silent about a good tile', () => {
    expect(describeLinkProblem(ok)).toBeNull();
  });

  it('asks for the missing pieces', () => {
    expect(describeLinkProblem({ ...ok, name: ' ' })).toMatch(/name/i);
    expect(describeLinkProblem({ ...ok, url: '' })).toMatch(/address/i);
  });

  it('refuses a dangerous scheme and a bare host', () => {
    expect(describeLinkProblem({ ...ok, url: 'javascript:alert(1)' })).toMatch(/https/i);
    expect(describeLinkProblem({ ...ok, url: 'uelnikobooking.com' })).toMatch(/https/i);
  });

  it('refuses plain http to a real host, because the database will', () => {
    expect(describeLinkProblem({ ...ok, url: 'http://uelnikobooking.com' })).toMatch(/https/i);
    expect(describeLinkProblem({ ...ok, url: 'http://localhost.evil.test' })).toMatch(/https/i);
  });

  it('accepts plain http to this machine (D19)', () => {
    expect(describeLinkProblem({ ...ok, url: 'http://localhost:5173' })).toBeNull();
    expect(describeLinkProblem({ ...ok, url: 'http://127.0.0.1:3001' })).toBeNull();
  });

  it('checks the colour is a hex triplet', () => {
    expect(describeLinkProblem({ ...ok, colour: 'blue' })).toMatch(/colour/i);
    expect(describeLinkProblem({ ...ok, colour: '#ABCDEF' })).toBeNull();
  });
});
