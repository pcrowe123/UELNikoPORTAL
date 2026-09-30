// Which storage the app is talking to, decided once when the module loads.
//
// With Supabase configured it is the real thing; without it, the local IndexedDB demo (D9).
// Nothing above this file knows or cares which.

import { supabaseConfigured, APP } from '../config';
import { createLocalBackend } from './local';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

export const isCloud = supabaseConfigured();

let instance: Backend | null = null;

export function getBackend(): Backend {
  if (!instance) {
    instance = isCloud
      ? createSupabaseBackend(APP.supabaseUrl, APP.supabaseAnonKey, APP.sessionKey)
      : createLocalBackend();
  }
  return instance;
}

export * from './types';
