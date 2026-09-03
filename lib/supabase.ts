import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabase-config';

const { url, anonKey } = readSupabaseConfig(process.env as Record<string, string | undefined>);
export const supabase = createClient(url, anonKey);
