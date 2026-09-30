// Inviting people to the portal, and resending an invitation (D22).
//
//   POST { action: 'invite', email, displayName, role, linkIds? }
//   POST { action: 'resend', userId }
//
// This is the only place the service-role key touches auth.users, and the only reason this
// function exists: creating an account needs that key, and the key can never go near a browser.
//
// The caller must be an active administrator. That is checked against the `profiles` table, never
// against anything they sent - see `_shared/auth.ts`. Everything below runs with a client that
// bypasses Row Level Security, so this check is the whole of the protection.

import { authenticate, note } from '../_shared/auth.ts';
import { json, preflight, readJson } from '../_shared/http.ts';

interface Body {
  action?: 'invite' | 'resend';
  email?: string;
  displayName?: string;
  role?: 'admin' | 'member';
  /** Applications to grant at the same time, so onboarding is one action rather than two. */
  linkIds?: string[];
  userId?: string;
}

const ROLES = ['admin', 'member'];

Deno.serve(async (req: Request) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const { caller, admin } = await authenticate(req);
    if (caller.role !== 'admin') {
      return json({ ok: false, error: 'Only an administrator can manage people.' }, 403);
    }

    const body = await readJson<Body>(req);
    const appUrl = Deno.env.get('APP_URL') ?? 'https://uelnikoportal.com';

    if (body.action === 'invite') {
      const email = (body.email ?? '').trim().toLowerCase();
      const role = body.role ?? 'member';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ ok: false, error: 'That is not an email address.' }, 400);
      }
      if (!ROLES.includes(role)) {
        return json({ ok: false, error: 'That is not a role.' }, 400);
      }

      // Inviting rather than creating with a password: they choose their own and nobody here ever
      // knows it. The trigger on auth.users turns this metadata into their profile row (D4).
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { role, display_name: (body.displayName ?? email).trim() },
        redirectTo: `${appUrl}/reset-password`,
      });
      if (error) {
        const already = /already been registered|already exists/i.test(error.message);
        return json(
          {
            ok: false,
            error: already
              ? `${email} already has an account. Change them on the People tab instead.`
              : error.message,
          },
          400,
        );
      }

      // Granting at the same time, so adding somebody who needs two applications is one action.
      // A failure here must not lose the account that was just made, so it is reported separately
      // rather than thrown: the invitation has already gone out and cannot be taken back.
      let grantWarning: string | null = null;
      const linkIds = Array.isArray(body.linkIds) ? body.linkIds.filter(Boolean) : [];
      if (linkIds.length) {
        const { error: grantError } = await admin.from('link_access').insert(
          linkIds.map((linkId) => ({
            user_id: data.user.id,
            link_id: linkId,
            granted_by: caller.id,
          })),
        );
        if (grantError) {
          grantWarning = `The invitation was sent, but the applications were not granted: ${grantError.message}`;
        }
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('id, email, display_name, role, is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      await note(admin, caller.id, 'user.invite', `${email} as ${role}`);
      return json({ ok: true, user: profile, warning: grantWarning });
    }

    if (body.action === 'resend') {
      if (!body.userId) return json({ ok: false, error: 'Which person?' }, 400);

      const { data: profile } = await admin
        .from('profiles')
        .select('email, role, display_name')
        .eq('id', body.userId)
        .maybeSingle();
      if (!profile) return json({ ok: false, error: 'No such person.' }, 404);

      // `inviteUserByEmail` refuses an address that already exists, so a resend is a password
      // recovery mail instead. It lands on the same page and does the same job.
      //
      // `resetPasswordForEmail`, NOT `admin.generateLink`: generateLink builds the link and hands
      // it back without sending anything, which would make this button appear to work while
      // nobody ever received an email.
      const { error } = await admin.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${appUrl}/reset-password`,
      });
      if (error) return json({ ok: false, error: error.message }, 400);

      await note(admin, caller.id, 'user.resend', profile.email);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action.' }, 400);
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 400);
  }
});
