// Creating a person, from the office PC.
//
//   node scripts/create-user.mjs --email patrick@uel.ie --name "Patrick Crowe" --role admin
//
// This is the only way a portal account is made: there is no signup page, and the Admin screen
// changes people rather than inviting them (D10). The service-role key it needs never leaves this
// PC, which is the point.
//
// The person is INVITED: they get an email and choose their own password. Nobody here ever knows
// it. The trigger on auth.users turns the metadata below into their profile row (D4).
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .dev.vars and VITE_SUPABASE_URL in .env.local.
// Nothing secret is printed.

import { authAdmin } from './lib/supabase-cli.mjs';
import { loadEnv, option, require_ } from './lib/env.mjs';

const env = loadEnv();
const ROLES = ['admin', 'member'];

const email = (option('email', '') ?? '').trim().toLowerCase();
const name = option('name', '') ?? '';
const role = (option('role', 'member') ?? 'member').toLowerCase();

if (!email) {
  console.error('\nnode scripts/create-user.mjs --email someone@uel.ie --name "Their Name" --role member\n');
  console.error(`Roles: ${ROLES.join(', ')}\n`);
  process.exit(2);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`\n"${email}" is not an email address.\n`);
  process.exit(2);
}
if (!ROLES.includes(role)) {
  console.error(`\n"${role}" is not a role. Use one of: ${ROLES.join(', ')}\n`);
  process.exit(2);
}

const url = require_(env, 'VITE_SUPABASE_URL', '.env.local');
const serviceKey = require_(env, 'SUPABASE_SERVICE_ROLE_KEY', '.dev.vars');
const appUrl = env.APP_URL || 'https://uelnikoportal.com';

console.log(`\nInviting ${email} as ${role} on ${url}`);
console.log('They will be emailed a link to choose their own password.\n');

try {
  const user = await authAdmin(url, serviceKey, 'invite', {
    method: 'POST',
    body: JSON.stringify({
      email,
      data: { role, display_name: name.trim() || email },
      redirect_to: `${appUrl}/reset-password`,
    }),
  });

  console.log(`Invited. Their user id is ${user.id}.`);
  console.log('\nIf the email does not arrive:');
  console.log('  - uel.ie has to be a verified sending domain in Resend');
  console.log('  - the SMTP settings have to be filled in on the Supabase dashboard');
  console.log('  - check the Auth logs in the Supabase dashboard\n');
} catch (err) {
  const message = String(err.message ?? err);
  if (message.includes('already been registered') || message.includes('already exists')) {
    console.error(`\n${email} already has an account. Change their role on the Admin screen.\n`);
    process.exit(1);
  }
  console.error(`\nThat did not work: ${message}\n`);
  process.exit(1);
}
