// The real backend.
//
// Column names are snake_case in the database and camelCase in the app; the mappers below are the
// only place that knows both (D8). Everything above this file sees the `Backend` interface.
//
// Two things are worth knowing before changing anything:
//
//  - Row Level Security is the enforcement, not the code here (CLAUDE.md rule 5). A member who
//    calls `createLink` gets a refusal from Postgres, not from a check in this file.
//  - Supabase fires PASSWORD_RECOVERY before any screen has mounted, so the event is latched when
//    it arrives and replayed to whoever subscribes afterwards.

import { createClient, type SupabaseClient, type User as AuthUser } from '@supabase/supabase-js';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AuditEntry,
  type Backend,
  type NewPortalLink,
  type PortalLink,
  type Role,
  type User,
} from './types';

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
}

interface LinkRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  url: string;
  colour: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuditRow {
  id: string;
  at: string;
  actor_id: string | null;
  action: string;
  detail: string | null;
  // PostgREST types an embedded relation as an array even where the foreign key makes it at most
  // one row, and supabase-js infers it that way. Accept both shapes rather than casting the
  // difference away.
  profiles?: { display_name: string | null }[] | { display_name: string | null } | null;
}

const userFromRow = (r: ProfileRow): User => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name ?? r.email,
  role: r.role,
  isActive: r.is_active,
});

const linkFromRow = (r: LinkRow): PortalLink => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline ?? '',
  url: r.url,
  colour: r.colour,
  sortOrder: r.sort_order,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const linkToRow = (l: Partial<NewPortalLink>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (l.slug !== undefined) row.slug = l.slug;
  if (l.name !== undefined) row.name = l.name;
  if (l.tagline !== undefined) row.tagline = l.tagline;
  if (l.url !== undefined) row.url = l.url;
  if (l.colour !== undefined) row.colour = l.colour;
  if (l.sortOrder !== undefined) row.sort_order = l.sortOrder;
  if (l.isActive !== undefined) row.is_active = l.isActive;
  return row;
};

const auditFromRow = (r: AuditRow): AuditEntry => {
  const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  return {
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actorName: profile?.display_name ?? null,
    action: r.action,
    detail: r.detail ?? '',
  };
};

/** Turn a Postgres error into something a person can read. */
function explain(error: { code?: string; message: string } | null): never {
  // 23505 is a unique violation: the only one a person can cause here, by reusing a slug.
  if (error?.code === '23505') throw new Error('There is already a tile with that short name.');
  // 23514 is a check violation - almost always the https:// or the colour rule.
  if (error?.code === '23514') {
    throw new Error('The database refused that: the address must be https:// and the colour #rrggbb.');
  }
  throw new Error(error?.message ?? 'Something went wrong.');
}

function settingsFromRows(rows: { key: string; value: unknown }[]): AppSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const read = <T>(key: string, fallback: T): T => (map.has(key) ? (map.get(key) as T) : fallback);
  return {
    welcome: read('portal.welcome', DEFAULT_SETTINGS.welcome),
    openInNewTab: read('portal.open_in_new_tab', DEFAULT_SETTINGS.openInNewTab),
    showSearch: read('portal.show_search', DEFAULT_SETTINGS.showSearch),
    siteName: read('site.name', DEFAULT_SETTINGS.siteName),
  };
}

function settingsToRows(s: AppSettings): { key: string; value: unknown }[] {
  return [
    { key: 'portal.welcome', value: s.welcome },
    { key: 'portal.open_in_new_tab', value: s.openInNewTab },
    { key: 'portal.show_search', value: s.showSearch },
    { key: 'site.name', value: s.siteName },
  ];
}

export function createSupabaseBackend(url: string, anonKey: string, sessionKey: string): Backend {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storageKey: sessionKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const userHandlers = new Set<(user: User | null) => void>();
  const recoveryHandlers = new Set<() => void>();
  let recoveryPending = false;

  /** The profile behind an authenticated user, or null if there is not an active one. */
  async function profileOf(authUser: AuthUser | null): Promise<User | null> {
    if (!authUser) return null;
    const { data, error } = await client
      .from('profiles')
      .select('id, email, display_name, role, is_active')
      .eq('id', authUser.id)
      .maybeSingle();
    if (error || !data) return null;
    const user = userFromRow(data as ProfileRow);
    // A deactivated account is not a signed-in person, whatever the session says (SE-02).
    return user.isActive ? user : null;
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      // This arrives before any screen has mounted. Latch it and replay it.
      if (recoveryHandlers.size === 0) recoveryPending = true;
      for (const handler of recoveryHandlers) handler();
      return;
    }
    void profileOf(session?.user ?? null).then((user) => {
      for (const handler of userHandlers) handler(user);
    });
  });

  return {
    isCloud: true,

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error(error.message);
      const user = await profileOf(data.user);
      if (!user) {
        // A sign-in with no active profile is not a sign-in. Do not leave a half-session behind.
        await client.auth.signOut();
        throw new Error('This login has no active profile. Ask an administrator.');
      }
      return user;
    },

    async signOut() {
      await client.auth.signOut();
    },

    async currentUser() {
      const { data } = await client.auth.getUser();
      return profileOf(data.user);
    },

    onUserChange(handler) {
      userHandlers.add(handler);
      void this.currentUser().then(handler).catch(() => handler(null));
      return () => userHandlers.delete(handler);
    },

    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
    },

    async setPassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },

    onPasswordRecovery(handler) {
      recoveryHandlers.add(handler);
      if (recoveryPending) {
        recoveryPending = false;
        handler();
      }
      return () => recoveryHandlers.delete(handler);
    },

    async listLinks(includeHidden = false) {
      let query = client.from('portal_links').select('*').order('sort_order');
      if (!includeHidden) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) explain(error);
      return (data as LinkRow[]).map(linkFromRow);
    },

    async createLink(link) {
      const { data, error } = await client
        .from('portal_links')
        .insert(linkToRow(link))
        .select('*')
        .single();
      if (error) explain(error);
      return linkFromRow(data as LinkRow);
    },

    async updateLink(id, change) {
      const { data, error } = await client
        .from('portal_links')
        .update(linkToRow(change))
        .eq('id', id)
        .select('*')
        .single();
      if (error) explain(error);
      return linkFromRow(data as LinkRow);
    },

    async removeLink(id) {
      // A tile somebody has opened is retired rather than deleted, so the audit trail keeps
      // pointing at something (D6). One that has never been opened goes for good.
      const { count, error: countError } = await client
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'launch')
        .eq('link_id', id);
      if (countError) explain(countError);

      if ((count ?? 0) > 0) {
        const { error } = await client
          .from('portal_links')
          .update({ is_active: false })
          .eq('id', id);
        if (error) explain(error);
        return { deleted: false };
      }

      const { error } = await client.from('portal_links').delete().eq('id', id);
      if (error) explain(error);
      return { deleted: true };
    },

    async listUsers() {
      const { data, error } = await client
        .from('profiles')
        .select('id, email, display_name, role, is_active')
        .order('display_name');
      if (error) explain(error);
      return (data as ProfileRow[]).map(userFromRow);
    },

    async updateUser(id, change) {
      const row: Record<string, unknown> = {};
      if (change.role !== undefined) row.role = change.role;
      if (change.isActive !== undefined) row.is_active = change.isActive;
      if (change.displayName !== undefined) row.display_name = change.displayName;
      const { data, error } = await client
        .from('profiles')
        .update(row)
        .eq('id', id)
        .select('id, email, display_name, role, is_active')
        .single();
      if (error) explain(error);
      return userFromRow(data as ProfileRow);
    },

    async getSettings() {
      const { data, error } = await client.from('app_settings').select('key, value');
      if (error) explain(error);
      return settingsFromRows(data as { key: string; value: unknown }[]);
    },

    async saveSettings(settings) {
      const { error } = await client.from('app_settings').upsert(settingsToRows(settings));
      if (error) explain(error);
      return settings;
    },

    async listAudit(limit = 200) {
      const { data, error } = await client
        .from('audit_log')
        .select('id, at, actor_id, action, detail, profiles:actor_id(display_name)')
        .order('at', { ascending: false })
        .limit(limit);
      if (error) explain(error);
      return (data as AuditRow[]).map(auditFromRow);
    },

    async recordLaunch(slug) {
      try {
        const { data } = await client.auth.getUser();
        if (!data.user) return;
        const { data: link } = await client
          .from('portal_links')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        await client.from('audit_log').insert({
          actor_id: data.user.id,
          action: 'launch',
          detail: slug,
          link_id: (link as { id: string } | null)?.id ?? null,
        });
      } catch {
        // A launch is never held up by its own bookkeeping (SE-03).
      }
    },
  };
}
