// What this build is and where it talks to.
//
// Only public values live here. Vite copies everything behind a VITE_ name into the browser
// bundle, so nothing secret may ever be given one (CLAUDE.md rule 4). The Supabase anon key is
// public by design: Row Level Security is what protects the data.

const env = import.meta.env;

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '');

export const APP = {
  /** Shown in the top bar, before the accent-coloured suffix. */
  brand: 'UEL / Niko',
  suffix: 'Portal',
  company: 'Uppercross Enterprises Ltd / Niko Bathrooms',
  supabaseUrl: clean(env.VITE_SUPABASE_URL),
  supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
  /** Where the login page says invitation and password-reset mail comes from. */
  authEmailFrom: 'portal@uel.ie',
  sessionKey: 'uelnikoportal-auth',
} as const;

export const APP_TITLE = `${APP.brand} ${APP.suffix}`;

/** False means the app runs against IndexedDB with a demo administrator (D9). */
export function supabaseConfigured(): boolean {
  return /^https?:\/\//.test(APP.supabaseUrl) && APP.supabaseAnonKey.length > 0;
}

declare global {
  const __APP_VERSION__: string;
}
