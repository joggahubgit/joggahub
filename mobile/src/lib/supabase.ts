import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { envResult } from './env';
import { secureStorage } from './secureStorage';

function build(): SupabaseClient {
  if (!envResult.ok) {
    // No fallback backend: any use throws. The root layout shows a config
    // error screen before any screen can reach this.
    const error = envResult.error;
    return new Proxy({} as SupabaseClient, {
      get() {
        throw new Error(error);
      },
    });
  }

  // Same Supabase project, auth and RLS as the web app — no parallel backend.
  const client = createClient(envResult.env.supabaseUrl, envResult.env.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // Refresh tokens only while the app is in the foreground (Supabase/Expo guidance).
  AppState.addEventListener('change', state => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });

  return client;
}

export const supabase = build();

/** Subset of public.profiles used by the app (mirrors src/lib/supabase.ts on web). */
export interface Profile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  location: string | null;
  preferred_position: string | null;
  onboarding_completed: boolean | null;
}
