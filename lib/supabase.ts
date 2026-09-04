import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './supabase-config';
import { getRealtimeOptions, getSupabaseAuthOptions } from './supabase-runtime';
import { buildSupabaseHealthcheckUrl } from './supabase-health';
import { createAuthAwareFetch, JWT_RECOVERY_MESSAGE } from './supabase-auth-recovery';

// Keep dot-notation references explicit so Expo can inline EXPO_PUBLIC values
// into the browser bundle. Dynamic reads from `process.env` are not inlined.
const config = resolveSupabaseConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
const { url, anonKey } = config;

export const isSupabaseConfigured = config.configured;
export const SUPABASE_CONFIGURATION_MESSAGE = config.configured
  ? ''
  : `Supabase 尚未設定：${config.missing.join('、')}。請在 Vercel 專案環境變數補齊後重新部署。`;

if (config.configured) {
  console.info('[Supabase] public environment loaded', { url: true, anonKey: true });
} else {
  console.warn(`[Supabase] ${SUPABASE_CONFIGURATION_MESSAGE}`);
}

let supabaseClient: SupabaseClient | null = null;
let recoveryListener: ((error: unknown) => void) | null = null;
let recoveryTask: Promise<void> | null = null;

/** Register the UI callback used when a JWT cannot be refreshed automatically. */
export function onSupabaseAuthRecovery(listener: (error: unknown) => void): () => void {
  recoveryListener = listener;
  return () => {
    if (recoveryListener === listener) recoveryListener = null;
  };
}

function handleRecoveryRequired(error: unknown) {
  if (recoveryTask) return;
  recoveryTask = (async () => {
    console.error('[Supabase] JWT recovery required', error);
    try {
      await supabaseClient?.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      console.error('[Supabase] local sign out after JWT failure failed', signOutError);
    }
    recoveryListener?.(error);
  })().finally(() => {
    recoveryTask = null;
  });
}

const authAwareFetch = createAuthAwareFetch({
  baseFetch: fetch.bind(globalThis),
  refreshSession: async () => {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  },
  onRecoveryRequired: handleRecoveryRequired,
});

export const supabase = createClient(url, anonKey, {
  auth: getSupabaseAuthOptions(),
  global: { fetch: authAwareFetch },
  realtime: getRealtimeOptions(),
});
supabaseClient = supabase;

export { JWT_RECOVERY_MESSAGE };

export async function pingSupabase() {
  try {
    const response = await fetch(buildSupabaseHealthcheckUrl(url), { headers: { apikey: anonKey } });
    return { reachable: response.ok, status: response.status };
  } catch (error) {
    console.error('[Supabase] ping failed', error);
    return { reachable: false, status: 0 };
  }
}
