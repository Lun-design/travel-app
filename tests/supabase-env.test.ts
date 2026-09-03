import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '../lib/supabase-config';

describe('readSupabaseConfig', () => {
  it('在缺少 URL 時拋出明確錯誤', () => {
    expect(() => readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'key' }))
      .toThrow('EXPO_PUBLIC_SUPABASE_URL is required');
  });
});
