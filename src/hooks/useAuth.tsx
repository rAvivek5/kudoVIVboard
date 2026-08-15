import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { watchAuth, getAdminProfile, adminSignIn, signOut } from '@/services/auth';
import type { AdminUser } from '@/types';

interface AuthState {
  user: User | null;
  admin: AdminUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const unsubscribe = watchAuth((next) => {
      if (!alive) return;
      setUser(next);

      if (!next) {
        setAdmin(null);
        setLoading(false);
        return;
      }

      // A contributor verified by magic link is also a Supabase user, but has
      // no row in `admins`. That absence is the whole distinction between the
      // two roles — there is no separate guest table.
      getAdminProfile(next.id)
        .then((profile) => alive && setAdmin(profile))
        .catch(() => alive && setAdmin(null))
        .finally(() => alive && setLoading(false));
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      admin,
      loading,
      isAdmin: Boolean(admin),
      signIn: async (email, password) => {
        setAdmin(await adminSignIn(email, password));
      },
      logOut: async () => {
        await signOut();
        setAdmin(null);
      },
    }),
    [user, admin, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
