import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabase-config';
import { getRealtimeOptions } from './supabase-runtime';
import { buildSupabaseHealthcheckUrl } from './supabase-health';

const { url, anonKey } = readSupabaseConfig(process.env as Record<string, string | undefined>);
console.info('[Supabase] public environment loaded', { url: Boolean(url), anonKey: Boolean(anonKey) });
export const supabase = createClient(url, anonKey, {
  realtime: getRealtimeOptions(),
});

export async function pingSupabase() {
  try {
    const response = await fetch(buildSupabaseHealthcheckUrl(url), { headers: { apikey: anonKey } });
    return { reachable: response.ok, status: response.status };
  } catch (error) {
    console.error('[Supabase] ping failed', error);
    return { reachable: false, status: 0 };
  }
}
