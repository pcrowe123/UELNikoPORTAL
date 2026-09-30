// Setting up and maintaining the Supabase project.
//
//   node scripts/setup-supabase.mjs --link           link this folder to the project in .env
//   node scripts/setup-supabase.mjs --migrate-only   apply any outstanding migrations
//   node scripts/setup-supabase.mjs --functions-only deploy the Edge Functions
//   node scripts/setup-supabase.mjs --status         say what is set up and what is not
//
// Creating the project itself is deliberately NOT automated: it costs money and it is a decision.
// Make it at https://supabase.com/dashboard, call it UELNikoPortal, region eu-west-1, then put its
// ref and database password in .env and run --link.
//
// The workspace guard blocks the Supabase MCP write tools from this folder (C:\Famous\CLAUDE.md
// rule 4), which is why the setup path is this script and not a tool call.
//
// Nothing secret is printed.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cli } from './lib/supabase-cli.mjs';
import { ROOT, flag, loadEnv, redact, require_ } from './lib/env.mjs';

const env = loadEnv();
const anyFlag = ['link', 'migrate-only', 'functions-only', 'status'].some(flag);

if (!anyFlag) {
  // The usage message is this file's own opening comment, so the two cannot disagree.
  const lines = [];
  for (const line of readFileSync(new URL(import.meta.url), 'utf8').split('\n')) {
    if (!line.startsWith('//')) break;
    lines.push(line.replace(/^\/\/ ?/, ''));
  }
  console.log(lines.join('\n'));
  process.exit(0);
}

const ref = (env.SUPABASE_PROJECT_REF ?? '').trim();

function requireRef() {
  if (!/^[a-z]{20}$/.test(ref)) {
    console.error(
      '\nSUPABASE_PROJECT_REF is not set (or does not look like a project ref).\n\n' +
        'Create the project at https://supabase.com/dashboard - name it UELNikoPortal, region\n' +
        'eu-west-1, in the same organisation as the sibling apps - then put these in .env:\n\n' +
        '  SUPABASE_PROJECT_REF=...\n  SUPABASE_DB_PASSWORD=...\n',
    );
    process.exit(2);
  }
  return ref;
}

if (flag('status')) {
  const migrations = existsSync(join(ROOT, 'supabase', 'migrations'))
    ? readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
    : [];

  console.log('\nUELNikoPortal — what is set up\n');
  console.log(`  Supabase project ref      ${ref || '(not set — see .env)'}`);
  console.log(`  Database password         ${env.SUPABASE_DB_PASSWORD ? 'set' : '(not set)'}`);
  console.log(`  Service-role key          ${env.SUPABASE_SERVICE_ROLE_KEY ? 'set (.dev.vars)' : '(not set)'}`);
  console.log(`  Browser URL               ${env.VITE_SUPABASE_URL || '(not set — .env.local)'}`);
  console.log(`  Browser anon key          ${redact(env.VITE_SUPABASE_ANON_KEY)}`);
  console.log(`  Resend SMTP password      ${env.SMTP_PASS ? 'set' : '(not set — invitations will not send)'}`);
  console.log(`  App URL                   ${env.APP_URL || 'https://uelnikoportal.com'}`);
  const functions = existsSync(join(ROOT, 'supabase', 'functions'))
    ? readdirSync(join(ROOT, 'supabase', 'functions'), { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
        .map((d) => d.name)
    : [];
  console.log(`\n  Migrations in this repo   ${migrations.length ? migrations.join(', ') : 'none'}`);
  console.log(`  Edge Functions            ${functions.length ? functions.join(', ') : 'none'}\n`);
  console.log('  Next: docs/PLAN.md.\n');
  process.exit(0);
}

if (flag('functions-only')) {
  requireRef();
  const dir = join(ROOT, 'supabase', 'functions');
  const functions = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

  let failed = 0;
  for (const fn of functions) {
    console.log(`\nDeploying ${fn}…`);
    // The JWT check stays on: the function reads the caller's token to decide whether they are an
    // administrator, and an unauthenticated caller has no business reaching it at all.
    const out = cli(['functions', 'deploy', fn, '--project-ref', ref, '--use-api']);
    if (out.status !== 0) failed++;
  }
  console.log(failed ? `\n${failed} function(s) failed.\n` : '\nAll functions deployed.\n');
  process.exit(failed ? 1 : 0);
}

if (flag('link')) {
  requireRef();
  const password = require_(env, 'SUPABASE_DB_PASSWORD', '.env');
  console.log(`Linking this folder to project ${ref}…`);
  const out = cli(['link', '--project-ref', ref], { env: { SUPABASE_DB_PASSWORD: password } });
  process.exit(out.status ?? 1);
}

if (flag('migrate-only')) {
  requireRef();
  const password = require_(env, 'SUPABASE_DB_PASSWORD', '.env');
  console.log(`Applying outstanding migrations to ${ref}…`);
  console.log('(Never edit a shipped migration — add a new 000N_*.sql instead.)\n');
  const out = cli(['db', 'push', '--project-ref', ref], { env: { SUPABASE_DB_PASSWORD: password } });
  process.exit(out.status ?? 1);
}
