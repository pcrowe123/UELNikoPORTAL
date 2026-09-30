import { describe, expect, it } from 'vitest';
import { canLaunch, lockedCount, lockedReason, partitionByAccess, type AccessMode } from './access';

const tile = (id: string, accessMode: AccessMode) => ({ id, accessMode });

describe('canLaunch', () => {
  it('lets anybody open an "everyone" tile', () => {
    expect(canLaunch({ mode: 'everyone', granted: false, isAdmin: false })).toBe(true);
  });

  it('locks an "invite" tile nobody has been given', () => {
    expect(canLaunch({ mode: 'invite', granted: false, isAdmin: false })).toBe(false);
  });

  it('opens an "invite" tile for somebody who has been granted it', () => {
    expect(canLaunch({ mode: 'invite', granted: true, isAdmin: false })).toBe(true);
  });

  it('never locks an administrator out', () => {
    // They can tick themselves in two clicks, so a padlock in front of one is theatre (D18).
    expect(canLaunch({ mode: 'invite', granted: false, isAdmin: true })).toBe(true);
  });

  it('ignores a stray grant on an "everyone" tile', () => {
    // Grants are not cleared when a tile goes back to "everyone", so this combination is real.
    expect(canLaunch({ mode: 'everyone', granted: true, isAdmin: false })).toBe(true);
  });
});

describe('lockedReason', () => {
  it('says nothing when the tile can be opened', () => {
    expect(lockedReason({ mode: 'everyone', granted: false, isAdmin: false })).toBeNull();
    expect(lockedReason({ mode: 'invite', granted: true, isAdmin: false })).toBeNull();
  });

  it('tells somebody what to do about it', () => {
    const why = lockedReason({ mode: 'invite', granted: false, isAdmin: false });
    expect(why).toMatch(/administrator/i);
  });
});

describe('partitionByAccess', () => {
  const links = [
    tile('a', 'everyone'),
    tile('b', 'invite'),
    tile('c', 'invite'),
    tile('d', 'everyone'),
  ];

  it('splits on what has been granted', () => {
    const { open, locked } = partitionByAccess(links, {
      grantedIds: new Set(['b']),
      isAdmin: false,
    });
    expect(open.map((l) => l.id)).toEqual(['a', 'b', 'd']);
    expect(locked.map((l) => l.id)).toEqual(['c']);
  });

  it('keeps the given order inside each group', () => {
    const { open } = partitionByAccess(links, { grantedIds: new Set(['c']), isAdmin: false });
    expect(open.map((l) => l.id)).toEqual(['a', 'c', 'd']);
  });

  it('locks nothing for an administrator', () => {
    const { open, locked } = partitionByAccess(links, { grantedIds: new Set(), isAdmin: true });
    expect(open).toHaveLength(4);
    expect(locked).toHaveLength(0);
  });

  it('locks every invitation tile for somebody with no grants', () => {
    const { open, locked } = partitionByAccess(links, { grantedIds: new Set(), isAdmin: false });
    expect(open.map((l) => l.id)).toEqual(['a', 'd']);
    expect(locked.map((l) => l.id)).toEqual(['b', 'c']);
  });

  it('copes with an empty list', () => {
    expect(partitionByAccess([], { grantedIds: new Set(), isAdmin: false })).toEqual({
      open: [],
      locked: [],
    });
  });
});

describe('lockedCount', () => {
  it('counts what a person cannot open', () => {
    const links = [tile('a', 'everyone'), tile('b', 'invite'), tile('c', 'invite')];
    expect(lockedCount(links, { grantedIds: new Set(), isAdmin: false })).toBe(2);
    expect(lockedCount(links, { grantedIds: new Set(['b']), isAdmin: false })).toBe(1);
    expect(lockedCount(links, { grantedIds: new Set(), isAdmin: true })).toBe(0);
  });
});
