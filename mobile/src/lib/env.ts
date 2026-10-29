/**
 * Validated runtime configuration. Fails loudly instead of silently falling
 * back to any default backend — a misconfigured build must never reach
 * production data by accident.
 *
 * EXPO_PUBLIC_* values are inlined at build time, so they must be read with
 * static property access (not process.env[name]).
 */
export type AppEnv = 'development' | 'preview' | 'production';

const raw = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  webUrl: process.env.EXPO_PUBLIC_WEB_URL,
};

const APP_ENVS: AppEnv[] = ['development', 'preview', 'production'];

function validate() {
  const missing = Object.entries(raw)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) return { ok: false as const, error: `Configuração ausente: ${missing.join(', ')}` };
  if (!APP_ENVS.includes(raw.appEnv as AppEnv)) {
    return { ok: false as const, error: `EXPO_PUBLIC_APP_ENV inválido: "${raw.appEnv}"` };
  }
  return {
    ok: true as const,
    env: {
      appEnv: raw.appEnv as AppEnv,
      supabaseUrl: raw.supabaseUrl!,
      supabaseAnonKey: raw.supabaseAnonKey!,
      webUrl: raw.webUrl!.replace(/\/$/, ''),
    },
  };
}

export const envResult = validate();

/** Only call after checking envResult.ok (the root layout does this). */
export function getEnv() {
  if (!envResult.ok) throw new Error(envResult.error);
  return envResult.env;
}
