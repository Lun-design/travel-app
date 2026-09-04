export type SupabaseEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export const SUPABASE_PLACEHOLDER_URL = 'https://placeholder.supabase.co';
export const SUPABASE_PLACEHOLDER_ANON_KEY = 'placeholder-anon-key';

export type ResolvedSupabaseConfig = {
  url: string;
  anonKey: string;
  configured: boolean;
  missing: Array<keyof SupabaseEnv>;
};

/**
 * Resolve public configuration without throwing while Expo evaluates modules in
 * Node.js for static rendering. The placeholder client never makes a request:
 * AuthGate checks `configured` before restoring a session or pinging Supabase.
 */
export function resolveSupabaseConfig(env: SupabaseEnv): ResolvedSupabaseConfig {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing: Array<keyof SupabaseEnv> = [];

  if (!url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  return {
    url: url || SUPABASE_PLACEHOLDER_URL,
    anonKey: anonKey || SUPABASE_PLACEHOLDER_ANON_KEY,
    configured: missing.length === 0,
    missing,
  };
}

export function readSupabaseConfig(env: SupabaseEnv) {
  const config = resolveSupabaseConfig(env);
  if (config.missing.includes('EXPO_PUBLIC_SUPABASE_URL')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is required');
  }
  if (config.missing.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is required');
  }
  return { url: config.url, anonKey: config.anonKey };
}
