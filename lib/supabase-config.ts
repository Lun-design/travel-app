export type SupabaseEnv = {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export function readSupabaseConfig(env: SupabaseEnv) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL is required');
  if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is required');
  return { url, anonKey };
}
