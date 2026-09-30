// The one place the screens get the backend, the signed-in person and the settings from.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getBackend, isCloud } from '../backend';
import {
  isAdmin as isAdminUser,
  DEFAULT_SETTINGS,
  type AppSettings,
  type Backend,
  type User,
} from '../backend/types';

interface AppValue {
  backend: Backend;
  user: User | null;
  loading: boolean;
  isCloud: boolean;
  isAdmin: boolean;
  settings: AppSettings;
  reloadSettings: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let live = true;
    const stop = backend.onUserChange((u) => {
      if (!live) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      live = false;
      stop();
    };
  }, [backend]);

  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await backend.getSettings());
    } catch {
      // Settings failing to load must not keep anyone out of a launcher: the built-in defaults
      // are perfectly workable.
      setSettings(DEFAULT_SETTINGS);
    }
  }, [backend]);

  useEffect(() => {
    if (user) void reloadSettings();
  }, [user, reloadSettings]);

  const signOut = useCallback(async () => {
    await backend.signOut();
    setUser(null);
  }, [backend]);

  const value = useMemo<AppValue>(
    () => ({
      backend,
      user,
      loading,
      isCloud,
      isAdmin: isAdminUser(user),
      settings,
      reloadSettings,
      signOut,
    }),
    [backend, user, loading, settings, reloadSettings, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
