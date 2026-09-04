import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { readSupabaseConfig } from './supabase-config';
import { getRealtimeOptions } from './supabase-runtime';
import { buildSupabaseHealthcheckUrl } from './supabase-health';
import { createAuthAwareFetch, JWT_RECOVERY_MESSAGE } from './supabase-auth-recovery';

const { url, anonKey } = readSupabaseConfig(process.env as Record<string, string | undefined>);
console.info('[Supabase] public environment loaded', { url: Boolean(url), anonKey: Boolean(anonKey) });

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
  auth: {
    // Keep the SDK's timer-based refresh enabled; the fetch wrapper below also
    // handles a token rejected early because of server/device clock skew.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
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
