// Who may launch what, as far as the landing page is concerned.
//
// Read the warning in `supabase/migrations/0003_access.sql` before relying on any of this: it
// decides how a tile is *drawn*, not what anybody can reach. A greyed tile still has its address
// in the page. The real gate is each application's own login (D2).
//
// Pure TypeScript, no React, no network (CLAUDE.md rule 8).

/** How a tile is offered. `everyone` is the default and is what all seven started as. */
export type AccessMode = 'everyone' | 'invite';

export interface AccessFacts {
  /** The tile's own setting. */
  mode: AccessMode;
  /** Has this person been granted this particular tile? */
  granted: boolean;
  /**
   * Administrators are never locked out.
   *
   * Not a shortcut: an administrator can open the Access dialog and tick themselves in two clicks,
   * so a padlock in front of one is pure theatre. Better to be honest about who holds the keys
   * than to draw a lock that its holder can open (D18).
   */
  isAdmin: boolean;
}

export function canLaunch({ mode, granted, isAdmin }: AccessFacts): boolean {
  if (mode === 'everyone') return true;
  if (isAdmin) return true;
  return granted;
}

/** What to tell somebody who taps a tile they have not been given, or null when they may launch. */
export function lockedReason(facts: AccessFacts): string | null {
  return canLaunch(facts)
    ? null
    : 'You have not been given this one yet. Ask an administrator to add it to your account.';
}

/**
 * Split a list into what a person may open and what is padlocked, keeping the given order within
 * each group. Locked tiles keep their place on the page rather than being pushed to the end:
 * "blocked out" should look like the same grid with some of it unavailable, not a reshuffle.
 */
export function partitionByAccess<T extends { id: string; accessMode: AccessMode }>(
  links: readonly T[],
  { grantedIds, isAdmin }: { grantedIds: ReadonlySet<string>; isAdmin: boolean },
): { open: T[]; locked: T[] } {
  const open: T[] = [];
  const locked: T[] = [];
  for (const link of links) {
    const facts = { mode: link.accessMode, granted: grantedIds.has(link.id), isAdmin };
    (canLaunch(facts) ? open : locked).push(link);
  }
  return { open, locked };
}

/** How many of these a person cannot open. For the line under the heading. */
export function lockedCount<T extends { id: string; accessMode: AccessMode }>(
  links: readonly T[],
  options: { grantedIds: ReadonlySet<string>; isAdmin: boolean },
): number {
  return partitionByAccess(links, options).locked.length;
}

export const ACCESS_LABELS: Record<AccessMode, string> = {
  everyone: 'Everyone',
  invite: 'By invitation',
};

export const ACCESS_DESCRIPTIONS: Record<AccessMode, string> = {
  everyone: 'Anyone who can sign in to the portal can open it.',
  invite: 'Only people given it on the People tab. Everyone else sees it padlocked.',
};
