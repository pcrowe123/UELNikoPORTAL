// The demo backend: everything in this browser's IndexedDB, nothing in the cloud (D9).
//
// It exists so the app can be developed, shown and smoke-tested with no Supabase project at all.
// Sign in with any email and any password and you are a demo administrator. There is no security
// here of any kind, which is exactly why `isCloud` is false and the top bar says "Demo" - never
// point a real build at this.

import Dexie, { type EntityTable } from 'dexie';
import { SEED_LINKS } from './seed';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AuditEntry,
  type Backend,
  type NewPortalLink,
  type PortalLink,
  type User,
} from './types';

interface SettingRow {
  key: string;
  value: unknown;
}

interface AccessRow {
  key: string;
  userId: string;
  linkId: string;
}

class PortalDb extends Dexie {
  links!: EntityTable<PortalLink, 'id'>;
  access!: EntityTable<AccessRow, 'key'>;
  users!: EntityTable<User, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  audit!: EntityTable<AuditEntry, 'id'>;

  constructor() {
    super('uelnikoportal-demo');
    this.version(1).stores({
      links: 'id, slug, sortOrder',
      users: 'id, email',
      settings: 'key',
      audit: 'id, at',
    });
    // Added with the access feature (D18). Dexie needs a new version for a new table; the old
    // one is left above so a browser holding the version 1 database upgrades rather than failing.
    this.version(2).stores({
      links: 'id, slug, sortOrder',
      users: 'id, email',
      settings: 'key',
      audit: 'id, at',
      access: 'key, userId, linkId',
    });
  }
}

const DEMO_USER: User = {
  id: 'demo-admin',
  email: 'demo@uel.ie',
  displayName: 'Demo Administrator',
  role: 'admin',
  isActive: true,
};

const now = () => new Date().toISOString();
const newId = () => `l_${Math.random().toString(36).slice(2, 10)}`;

export function createLocalBackend(): Backend {
  const db = new PortalDb();
  const userHandlers = new Set<(user: User | null) => void>();
  let signedIn: User | null = null;
  let ready: Promise<void> | null = null;

  /** Put the seven tiles in on first use, once. */
  function prepare(): Promise<void> {
    ready ??= (async () => {
      if ((await db.links.count()) === 0) {
        await db.links.bulkAdd(
          SEED_LINKS.map((l) => ({ ...l, id: newId(), createdAt: now(), updatedAt: now() })),
        );
      }
      if ((await db.users.count()) === 0) await db.users.add(DEMO_USER);
    })();
    return ready;
  }

  function announce() {
    for (const handler of userHandlers) handler(signedIn);
  }

  async function requireLink(id: string): Promise<PortalLink> {
    const found = await db.links.get(id);
    if (!found) throw new Error('That tile is no longer there.');
    return found;
  }

  return {
    isCloud: false,

    async signIn(email) {
      await prepare();
      signedIn = { ...DEMO_USER, email: email.trim() || DEMO_USER.email };
      announce();
      return signedIn;
    },

    async signOut() {
      signedIn = null;
      announce();
    },

    async currentUser() {
      return signedIn;
    },

    onUserChange(handler) {
      userHandlers.add(handler);
      // Nobody is signed in when the page loads: the demo has no session to restore.
      handler(signedIn);
      return () => userHandlers.delete(handler);
    },

    async sendPasswordReset() {
      // Nothing to send. The login screen says so.
    },

    async setPassword() {
      // Nothing to set.
    },

    onPasswordRecovery() {
      return () => {};
    },

    async listLinks(includeHidden = false) {
      await prepare();
      const all = await db.links.toArray();
      return includeHidden ? all : all.filter((l) => l.isActive);
    },

    async createLink(link: NewPortalLink) {
      await prepare();
      const row: PortalLink = { ...link, id: newId(), createdAt: now(), updatedAt: now() };
      await db.links.add(row);
      return row;
    },

    async updateLink(id, change) {
      const existing = await requireLink(id);
      const row: PortalLink = { ...existing, ...change, updatedAt: now() };
      await db.links.put(row);
      return row;
    },

    async removeLink(id) {
      await requireLink(id);
      // The demo has no launch history to preserve, so a delete is always a delete.
      await db.links.delete(id);
      return { deleted: true };
    },

    async listMyAccess() {
      await prepare();
      if (!signedIn) return [];
      const rows = await db.access.where('userId').equals(signedIn.id).toArray();
      return rows.map((r) => r.linkId);
    },

    async listAccessFor(userId) {
      await prepare();
      const rows = await db.access.where('userId').equals(userId).toArray();
      return rows.map((r) => r.linkId);
    },

    async setAccessFor(userId, linkIds) {
      await prepare();
      const existing = await db.access.where('userId').equals(userId).toArray();
      await db.access.bulkDelete(existing.map((r) => r.key));
      await db.access.bulkAdd(
        linkIds.map((linkId) => ({ key: `${userId}:${linkId}`, userId, linkId })),
      );
    },

    async listUsers() {
      await prepare();
      return db.users.toArray();
    },

    async updateUser(id, change) {
      const existing = await db.users.get(id);
      if (!existing) throw new Error('No such person.');
      const row: User = { ...existing, ...change } as User;
      await db.users.put(row);
      if (signedIn?.id === id) {
        signedIn = row;
        announce();
      }
      return row;
    },

    async getSettings() {
      await prepare();
      const rows = await db.settings.toArray();
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return {
        welcome: (map.get('portal.welcome') as string) ?? DEFAULT_SETTINGS.welcome,
        openInNewTab: (map.get('portal.open_in_new_tab') as boolean) ?? DEFAULT_SETTINGS.openInNewTab,
        showSearch: (map.get('portal.show_search') as boolean) ?? DEFAULT_SETTINGS.showSearch,
        siteName: (map.get('site.name') as string) ?? DEFAULT_SETTINGS.siteName,
      };
    },

    async saveSettings(settings: AppSettings) {
      await db.settings.bulkPut([
        { key: 'portal.welcome', value: settings.welcome },
        { key: 'portal.open_in_new_tab', value: settings.openInNewTab },
        { key: 'portal.show_search', value: settings.showSearch },
        { key: 'site.name', value: settings.siteName },
      ]);
      return settings;
    },

    async listAudit(limit = 200) {
      await prepare();
      const all = await db.audit.reverse().sortBy('at');
      return all.slice(0, limit);
    },

    async recordLaunch(slug) {
      try {
        await db.audit.add({
          id: newId(),
          at: now(),
          actorId: signedIn?.id ?? null,
          actorName: signedIn?.displayName ?? null,
          action: 'launch',
          detail: slug,
        });
      } catch {
        // A launch is never held up by its own bookkeeping (SE-03).
      }
    },
  } satisfies Backend;
}
