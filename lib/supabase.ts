import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabase-config';

const { url, anonKey } = readSupabaseConfig(process.env as Record<string, string | undefined>);
console.info('[Supabase] public environment loaded', { url: Boolean(url), anonKey: Boolean(anonKey) });
export const supabase = createClient(url, anonKey);
