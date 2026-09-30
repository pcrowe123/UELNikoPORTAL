// Who is calling, and with what rights.
//
// A function never takes the caller's word for their role. It verifies the token, then reads the
// profile from the database - the same row Row Level Security uses. This matters more here than
// anywhere else in the project: this is the one place the service-role key exists, and the key
// bypasses RLS entirely, so the check below is the whole of the protection.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { bearer } from './http.ts';

export type Role = 'admin' | 'member';

export interface Caller {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
}

/** The service-role client. Bypasses Row Level Security, so use it deliberately. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('This function is not configured.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function authenticate(req: Request): Promise<{ caller: Caller; admin: SupabaseClient }> {
  const token = bearer(req);
  if (!token) throw new Error('You are not signed in.');

  const admin = serviceClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('That sign-in is no longer valid.');

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, display_name, role, is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) throw new Error('This login has no profile.');
  if (!profile.is_active) throw new Error('This account has been switched off.');

  return {
    caller: {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name ?? profile.email,
      role: profile.role as Role,
      isActive: profile.is_active,
    },
    admin,
  };
}

/** Record who did what. Never let a failed audit write fail the thing being audited. */
export async function note(
  admin: SupabaseClient,
  actorId: string | null,
  action: string,
  detail: string,
): Promise<void> {
  try {
    await admin.from('audit_log').insert({ actor_id: actorId, action, detail });
  } catch {
    /* the audit trail is not worth failing the operation over */
  }
}
