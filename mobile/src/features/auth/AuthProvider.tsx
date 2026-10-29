import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from '@/lib/supabase';
import { getEnv } from '@/lib/env';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the stored session has been read on launch. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    // Profile rows are created by the on_auth_user_created trigger; the app only reads.
    const { data } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, location, preferred_position, onboarding_completed')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    let lastUserId: string | undefined;
    const apply = (next: Session | null) => {
      setSession(next);
      const nextUserId = next?.user.id;
      if (nextUserId === lastUserId) return; // token refresh: profile unchanged
      lastUserId = nextUserId;
      if (!nextUserId) return setProfile(null);
      // Deferred: Supabase calls inside onAuthStateChange can deadlock the client.
      setTimeout(() => loadProfile(nextUserId).catch(() => setProfile(null)), 0);
    };

    supabase.auth.getSession().then(({ data }) => {
      apply(data.session);
      setInitializing(false);
    });
    // Covers sign-in, sign-out, token refresh and refresh failure (expired session → null).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => apply(next));
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const userId = session?.user.id;

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        // Confirmation opens the web callback (already allowed in Supabase Auth).
        // Switch to joggahub://auth/callback once that redirect URL is allowed.
        emailRedirectTo: `${getEnv().webUrl}/auth/callback`,
      },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    // Local scope: clears this device even when offline; other devices stay signed in.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, initializing, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
