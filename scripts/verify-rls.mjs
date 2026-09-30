// Prove the database refuses what it should, against the real project.
//
//   node scripts/verify-rls.mjs
//
// `npm run e2e` drives the screens; this drives the database, which is where the actual
// enforcement lives (CLAUDE.md rule 5). The two together are the whole check.
//
// It makes two throwaway accounts, asks the API a series of questions as those people, and deletes
// them again. It is safe to run against the live project at any time:
//
//   - the accounts are created with a password and `email_confirm`, through the admin API, so
//     NOBODY IS EVER EMAILED;
//   - they are named `rls-check-<random>@invalid.test`, on the reserved `.test` TLD, so the
//     addresses cannot belong to a real person;
//   - everything it writes, it writes as one of those two accounts, and both are deleted at the
//     end - including on failure.
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .dev.vars, and VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in
// .env.local. Nothing secret is printed.

import { randomBytes } from 'node:crypto';
import { loadEnv, require_ } from './lib/env.mjs';

const env = loadEnv();
const URL_ = require_(env, 'VITE_SUPABASE_URL', '.env.local').replace(/\/+$/, '');
const ANON = require_(env, 'VITE_SUPABASE_ANON_KEY', '.env.local');
const SERVICE = require_(env, 'SUPABASE_SERVICE_ROLE_KEY', '.dev.vars');

let failures = 0;
const step = (name) => process.stdout.write(`  ${name} … `);
const pass = () => process.stdout.write('ok\n');
const fail = (why) => {
  failures++;
  process.stdout.write(`FAILED\n      ${why}\n`);
};

/** A request as a particular person (or as nobody, with just the anon key). */
async function api(path, { token = ANON, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* some errors come back as plain text */
  }
  return { status: res.status, ok: res.ok, body: json ?? text };
}

async function admin(path, { method = 'POST', body } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const made = [];

/** A throwaway person, created with a password so that no invitation email is ever sent. */
async function makePerson(role) {
  const email = `rls-check-${randomBytes(6).toString('hex')}@invalid.test`;
  const password = randomBytes(24).toString('base64url');
  const user = await admin('/auth/v1/admin/users', {
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { role, display_name: `RLS check (${role})` },
    },
  });
  made.push(user.id);

  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (!signIn.ok) throw new Error(`could not sign in as the ${role}: ${JSON.stringify(signIn.body)}`);
  return { id: user.id, email, token: signIn.body.access_token };
}

async function cleanUp() {
  // The launch this script records to prove SE-03 is real data in a real table, and no policy
  // lets anybody delete it - that is the point of the append-only check above. Trimming it is a
  // service-role job, and the script does its own trimming so a run leaves nothing behind and
  // Patrick's Activity tab stays meaningful.
  await admin('/rest/v1/audit_log?detail=eq.rls-check', { method: 'DELETE' }).catch(() => {});
  for (const id of made) {
    await admin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

console.log(`\nDatabase rules, against ${URL_}\n`);

try {
  const member = await makePerson('member');
  const boss = await makePerson('admin');

  // The trigger on auth.users should have turned the invitation metadata into a profile row.
  step('a new account gets a profile, with the role it was given');
  const mine = await api(`/rest/v1/profiles?id=eq.${member.id}&select=role,is_active`, {
    token: member.token,
  });
  mine.ok && mine.body[0]?.role === 'member' && mine.body[0]?.is_active === true
    ? pass()
    : fail(`expected an active member profile, got ${JSON.stringify(mine.body)}`);

  // SE-01. The anon key is in the browser bundle; it must buy nothing at all.
  step('a stranger with the anon key sees no tiles (SE-01)');
  const stranger = await api('/rest/v1/portal_links?select=slug');
  stranger.ok && Array.isArray(stranger.body) && stranger.body.length === 0
    ? pass()
    : fail(`expected an empty list for anon, got ${stranger.status} ${JSON.stringify(stranger.body)}`);

  step('a stranger cannot read the people either');
  const strangerPeople = await api('/rest/v1/profiles?select=email');
  strangerPeople.ok && Array.isArray(strangerPeople.body) && strangerPeople.body.length === 0
    ? pass()
    : fail(`expected an empty list for anon, got ${strangerPeople.status} ${JSON.stringify(strangerPeople.body)}`);

  // D3: everyone who can sign in sees every tile. This is also the check that the EXECUTE revoke
  // in 0002 did not break the policies, which all call current_user_active().
  // Not a magic number: the count is asked of the database itself, so adding or hiding a tile
  // never makes this check fail for a reason that has nothing to do with the rule it is testing.
  step('a member sees every tile that is switched on (D3)');
  const shownToAll = await admin('/rest/v1/portal_links?select=slug&is_active=eq.true', {
    method: 'GET',
  });
  const tiles = await api('/rest/v1/portal_links?select=slug&is_active=eq.true', {
    token: member.token,
  });
  tiles.ok && tiles.body.length === shownToAll.length && shownToAll.length > 0
    ? pass()
    : fail(
        `a member saw ${tiles.body?.length} of the ${shownToAll.length} switched-on tiles: ${JSON.stringify(tiles.body)}`,
      );

  step('a member does not see a tile that is switched off');
  const hiddenToMember = await api('/rest/v1/portal_links?select=slug&is_active=eq.false', {
    token: member.token,
  });
  Array.isArray(hiddenToMember.body) && hiddenToMember.body.length === 0
    ? pass()
    : fail(`a member saw hidden tiles: ${JSON.stringify(hiddenToMember.body)}`);

  step('a member can read the settings the landing page needs');
  const settings = await api('/rest/v1/app_settings?select=key', { token: member.token });
  settings.ok && settings.body.length > 0
    ? pass()
    : fail(`expected settings, got ${settings.status} ${JSON.stringify(settings.body)}`);

  // AD-07 / SE-05. The route guard is cosmetic; this is the real thing.
  step('a member cannot add a tile (SE-05)');
  const sneak = await api('/rest/v1/portal_links', {
    token: member.token,
    method: 'POST',
    body: { slug: 'rls-check', name: 'RLS check', url: 'https://example.test', colour: '#0f4c81' },
  });
  sneak.status === 401 || sneak.status === 403
    ? pass()
    : fail(`a member inserted a tile, or got an unexpected status: ${sneak.status} ${JSON.stringify(sneak.body)}`);

  step('a member cannot change a tile');
  const sneakEdit = await api('/rest/v1/portal_links?slug=eq.booking', {
    token: member.token,
    method: 'PATCH',
    body: { url: 'https://evil.test' },
    headers: { Prefer: 'return=representation' },
  });
  const changedNothing =
    sneakEdit.status === 401 ||
    sneakEdit.status === 403 ||
    (Array.isArray(sneakEdit.body) && sneakEdit.body.length === 0);
  changedNothing
    ? pass()
    : fail(`a member changed a tile: ${sneakEdit.status} ${JSON.stringify(sneakEdit.body)}`);

  step('a member cannot read the activity log');
  const sneakAudit = await api('/rest/v1/audit_log?select=id', { token: member.token });
  sneakAudit.ok && Array.isArray(sneakAudit.body) && sneakAudit.body.length === 0
    ? pass()
    : fail(`expected nothing, got ${sneakAudit.status} ${JSON.stringify(sneakAudit.body)}`);

  // SE-08. The trigger, not a policy - a member updating their own row is allowed, but not the
  // columns that decide what they may do.
  step('a member cannot promote themselves (SE-08)');
  const promote = await api(`/rest/v1/profiles?id=eq.${member.id}`, {
    token: member.token,
    method: 'PATCH',
    body: { role: 'admin' },
    headers: { Prefer: 'return=representation' },
  });
  const stillMember = await api(`/rest/v1/profiles?id=eq.${member.id}&select=role`, {
    token: member.token,
  });
  stillMember.body[0]?.role === 'member'
    ? pass()
    : fail(`a member promoted themselves: ${promote.status} ${JSON.stringify(promote.body)}`);

  step('an administrator can add a tile');
  const added = await api('/rest/v1/portal_links', {
    token: boss.token,
    method: 'POST',
    body: {
      slug: 'rls-check',
      name: 'RLS check',
      tagline: 'Created and removed by scripts/verify-rls.mjs.',
      url: 'https://example.test',
      colour: '#0f4c81',
      sort_order: 99,
    },
    headers: { Prefer: 'return=representation' },
  });
  added.ok ? pass() : fail(`an administrator could not add a tile: ${added.status} ${JSON.stringify(added.body)}`);

  // SE-06, the half of the https rule that lives in the database.
  step('the database refuses a tile that is not https (SE-06)');
  const insecure = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { url: 'http://example.test' },
    headers: { Prefer: 'return=representation' },
  });
  const refusedHttp =
    !insecure.ok && JSON.stringify(insecure.body).includes('portal_links_url_scheme');
  refusedHttp
    ? pass()
    : fail(`expected the url_https constraint to refuse it, got ${insecure.status} ${JSON.stringify(insecure.body)}`);

  step('the database accepts a localhost address (D19)');
  const local = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { url: 'http://localhost:5173' },
    headers: { Prefer: 'return=representation' },
  });
  local.ok
    ? pass()
    : fail(`a localhost tile should be allowed, got ${local.status} ${JSON.stringify(local.body)}`);

  step('but not a host that merely starts with "localhost"');
  const lookalike = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { url: 'http://localhost.evil.test' },
    headers: { Prefer: 'return=representation' },
  });
  !lookalike.ok && JSON.stringify(lookalike.body).includes('portal_links_url_scheme')
    ? pass()
    : fail(`localhost.evil.test should be refused, got ${lookalike.status} ${JSON.stringify(lookalike.body)}`);

  step('and the tile is put back to a real address');
  const restore = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { url: 'https://example.test' },
    headers: { Prefer: 'return=representation' },
  });
  restore.ok ? pass() : fail(`could not restore: ${restore.status}`);

  step('the database refuses a javascript: address too');
  const script = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { url: 'javascript:alert(1)' },
    headers: { Prefer: 'return=representation' },
  });
  !script.ok && JSON.stringify(script.body).includes('portal_links_url_scheme')
    ? pass()
    : fail(`expected the url_https constraint to refuse it, got ${script.status} ${JSON.stringify(script.body)}`);

  step('an administrator can remove the tile again');
  const removed = await api('/rest/v1/portal_links?slug=eq.rls-check', {
    token: boss.token,
    method: 'DELETE',
  });
  removed.ok ? pass() : fail(`could not delete: ${removed.status} ${JSON.stringify(removed.body)}`);

  // SE-03. A launch is recorded in the signed-in person's own name and nobody else's.
  step('a launch is recorded, and only in your own name (SE-03)');
  const recorded = await api('/rest/v1/audit_log', {
    token: boss.token,
    method: 'POST',
    body: { actor_id: boss.id, action: 'launch', detail: 'rls-check' },
  });
  const asSomeoneElse = await api('/rest/v1/audit_log', {
    token: boss.token,
    method: 'POST',
    body: { actor_id: '00000000-0000-0000-0000-000000000000', action: 'launch', detail: 'forged' },
  });
  recorded.ok && !asSomeoneElse.ok
    ? pass()
    : fail(
        `own launch ${recorded.status}, forged launch ${asSomeoneElse.status} — the forged one should have been refused`,
      );

  step('nobody can rewrite the activity log');
  const rewrite = await api('/rest/v1/audit_log?detail=eq.rls-check', {
    token: boss.token,
    method: 'PATCH',
    body: { detail: 'something else' },
    headers: { Prefer: 'return=representation' },
  });
  const wiped = await api('/rest/v1/audit_log?detail=eq.rls-check', {
    token: boss.token,
    method: 'DELETE',
  });
  const rewroteNothing =
    rewrite.status === 401 || rewrite.status === 403 || (Array.isArray(rewrite.body) && rewrite.body.length === 0);
  rewroteNothing && (wiped.status === 401 || wiped.status === 403 || wiped.status === 204)
    ? pass()
    : fail(`the log was editable: patch ${rewrite.status}, delete ${wiped.status}`);

  // Access grants (D18). What is enforced here is who may GRANT - the padlock on the landing page
  // is only an appearance, and deliberately so. A member quietly granting themselves is what would
  // make the Admin screen a lie, so that is the thing worth proving.
  step('a member cannot grant themselves an application (D18)');
  const anyLink = await api('/rest/v1/portal_links?select=id&limit=1', { token: member.token });
  const linkId = anyLink.body?.[0]?.id;
  const selfGrant = await api('/rest/v1/link_access', {
    token: member.token,
    method: 'POST',
    body: { link_id: linkId, user_id: member.id },
  });
  selfGrant.status === 401 || selfGrant.status === 403
    ? pass()
    : fail(`a member granted themselves access: ${selfGrant.status} ${JSON.stringify(selfGrant.body)}`);

  step('an administrator can grant, and the member then sees the grant');
  const grant = await api('/rest/v1/link_access', {
    token: boss.token,
    method: 'POST',
    body: { link_id: linkId, user_id: member.id, granted_by: boss.id },
  });
  const memberSees = await api(`/rest/v1/link_access?select=link_id`, { token: member.token });
  grant.ok && Array.isArray(memberSees.body) && memberSees.body.some((r) => r.link_id === linkId)
    ? pass()
    : fail(`grant ${grant.status}, member saw ${JSON.stringify(memberSees.body)}`);

  step('a member cannot see anybody else\'s grants');
  const others = await api(`/rest/v1/link_access?select=user_id&user_id=neq.${member.id}`, {
    token: member.token,
  });
  Array.isArray(others.body) && others.body.length === 0
    ? pass()
    : fail(`a member read somebody else's grants: ${JSON.stringify(others.body)}`);

  step('a member cannot revoke a grant either');
  const revoke = await api(`/rest/v1/link_access?link_id=eq.${linkId}&user_id=eq.${member.id}`, {
    token: member.token,
    method: 'DELETE',
  });
  const stillGranted = await api('/rest/v1/link_access?select=link_id', { token: member.token });
  Array.isArray(stillGranted.body) && stillGranted.body.some((r) => r.link_id === linkId)
    ? pass()
    : fail(`a member revoked their own grant: ${revoke.status}`);

  step('the database refuses an access mode that is not one of the two');
  const badMode = await api(`/rest/v1/portal_links?id=eq.${linkId}`, {
    token: boss.token,
    method: 'PATCH',
    body: { access_mode: 'sometimes' },
    headers: { Prefer: 'return=representation' },
  });
  !badMode.ok && JSON.stringify(badMode.body).includes('portal_links_access_mode')
    ? pass()
    : fail(`expected the access_mode check to refuse it, got ${badMode.status} ${JSON.stringify(badMode.body)}`);

  // SE-02. The session is still valid; the profile is not.
  step('a deactivated account loses its access at once (SE-02)');
  await admin('/rest/v1/profiles?id=eq.' + boss.id, {
    method: 'PATCH',
    body: { is_active: false },
  }).catch(() => {});
  const afterDeactivation = await api('/rest/v1/portal_links?select=slug', { token: boss.token });
  Array.isArray(afterDeactivation.body) && afterDeactivation.body.length === 0
    ? pass()
    : fail(
        `a deactivated administrator still saw ${JSON.stringify(afterDeactivation.body)} with their existing token`,
      );

  step('the migration ledger is not served to anybody');
  const ledger = await api('/rest/v1/app_migrations?select=name');
  const ledgerAsUser = await api('/rest/v1/app_migrations?select=name', { token: boss.token });
  const hidden = (r) => !r.ok || (Array.isArray(r.body) && r.body.length === 0);
  hidden(ledger) && hidden(ledgerAsUser)
    ? pass()
    : fail(`the ledger was readable: anon ${JSON.stringify(ledger.body)}, user ${JSON.stringify(ledgerAsUser.body)}`);
} catch (err) {
  fail(err.message);
} finally {
  await cleanUp();
  console.log('\n  throwaway accounts deleted');
}

console.log(failures ? `\n${failures} check(s) failed.\n` : '\nEvery rule held.\n');
process.exit(failures ? 1 : 0);
