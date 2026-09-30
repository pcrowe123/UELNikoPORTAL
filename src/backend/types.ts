// The storage and authentication boundary. Two implementations: Supabase (the real one) and a
// local IndexedDB store for development and demonstrations with no cloud project at all (D9).
// The screens only ever talk to this interface.
//
// Names here are camelCase. The database is snake_case, and `supabase.ts` is the only file that
// knows both (D8).

import type { LinkLike } from '../engine/links';

/**
 * Two roles, not three. Everyone who can sign in sees every tile (D3), so the only distinction
 * worth having is whether a person may change the tile list and the user list.
 */
export type Role = 'admin' | 'member';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  member: 'Member',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Everything: the tile list, people, and settings.',
  member: 'Sees the landing page and opens the applications.',
};

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
}

/** Who may do what. Written here and again as an RLS policy - both, always (CLAUDE.md rule 5). */
export function isAdmin(user: User | null): boolean {
  return !!user && user.isActive && user.role === 'admin';
}

/** A tile on the landing page. */
export interface PortalLink extends LinkLike {
  createdAt: string;
  updatedAt: string;
}

export type NewPortalLink = Omit<PortalLink, 'id' | 'createdAt' | 'updatedAt'>;

export interface AppSettings {
  /** The line under the heading on the landing page. */
  welcome: string;
  /** Open an application in a new tab, or navigate away from the portal (CI-01). */
  openInNewTab: boolean;
  /** Show the search box. Pointless with six tiles, useful with twenty. */
  showSearch: boolean;
  siteName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  welcome: 'Pick an application. Each one asks you to sign in with its own account.',
  openInNewTab: true,
  showSearch: true,
  siteName: 'Uppercross/Niko',
};

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  detail: string;
}

export interface Backend {
  /** True when this is the real thing rather than the local demo (D9). */
  readonly isCloud: boolean;

  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  currentUser(): Promise<User | null>;
  onUserChange(handler: (user: User | null) => void): () => void;
  sendPasswordReset(email: string): Promise<void>;
  /** Called on the reset page once Supabase has put the recovery session in place. */
  setPassword(password: string): Promise<void>;
  onPasswordRecovery(handler: () => void): () => void;

  listLinks(includeHidden?: boolean): Promise<PortalLink[]>;
  createLink(link: NewPortalLink): Promise<PortalLink>;
  updateLink(id: string, change: Partial<NewPortalLink>): Promise<PortalLink>;
  /** Retires the tile (D6). Deletes it outright only if nobody has ever opened it. */
  removeLink(id: string): Promise<{ deleted: boolean }>;

  listUsers(): Promise<User[]>;
  updateUser(id: string, change: { role?: Role; isActive?: boolean; displayName?: string }): Promise<User>;

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;

  listAudit(limit?: number): Promise<AuditEntry[]>;
  /**
   * Notes that somebody opened an application. Never throws and never blocks the click: the
   * launch matters, the record of it does not (SE-03).
   */
  recordLaunch(slug: string): Promise<void>;
}
