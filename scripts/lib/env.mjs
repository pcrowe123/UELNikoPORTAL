// Reading the gitignored .env, .env.local and .dev.vars files.
//
// Nothing secret is ever printed by anything that uses this.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** Parse a KEY=value file. Quotes are stripped; # starts a comment on its own line. */
export function readEnvFile(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Everything the scripts might need, real environment first. */
export function loadEnv() {
  return {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
    ...readEnvFile('.dev.vars'),
    ...process.env,
  };
}

/** A value that must be there, with a message saying exactly where to put it. */
export function require_(env, name, file) {
  const value = (env[name] ?? '').trim();
  if (!value) {
    console.error(`\n${name} is not set.\n\nAdd it to ${file}:\n\n  ${name}=...\n`);
    process.exit(2);
  }
  return value;
}

/** Enough of a value to recognise it in a log, without giving it away. */
export function redact(value) {
  if (!value) return '(not set)';
  return value.length <= 8 ? '********' : `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

export function option(name, fallback) {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}
