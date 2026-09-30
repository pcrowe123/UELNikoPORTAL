// Running the Supabase CLI, and talking to the project over its REST API.

import { spawnSync } from 'node:child_process';
import { ROOT } from './env.mjs';

/** Run `supabase ...`. Returns { status, stdout, stderr } and never throws. */
export function cli(args, { env = {}, quiet = false } = {}) {
  const out = spawnSync('npx', ['--yes', 'supabase', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (!quiet) {
    if (out.stdout?.trim()) console.log(out.stdout.trim());
    if (out.status !== 0 && out.stderr?.trim()) console.error(out.stderr.trim());
  }
  return out;
}

/** Read something small back out of the project with the service-role key. */
export async function rest(url, serviceKey, path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** The Auth admin API, for creating people. */
export async function authAdmin(url, serviceKey, path, init = {}) {
  const res = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
