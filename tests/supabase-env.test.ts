import { describe, expect, it } from 'vitest';
import { readSupabaseConfig, resolveSupabaseConfig } from '../lib/supabase-config';

describe('readSupabaseConfig', () => {
  it('在缺少 URL 時拋出明確錯誤', () => {
    expect(() => readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'key' }))
      .toThrow('EXPO_PUBLIC_SUPABASE_URL is required');
  });

  it('static export 缺少公開環境變數時提供不連線的 placeholder', () => {
    expect(resolveSupabaseConfig({})).toEqual({
      url: 'https://placeholder.supabase.co',
      anonKey: 'placeholder-anon-key',
      configured: false,
      missing: ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'],
    });
  });

  it('完整設定時保留正式 Supabase 連線資訊', () => {
    expect(resolveSupabaseConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_example',
    })).toEqual({
      url: 'https://project.supabase.co',
      anonKey: 'sb_publishable_example',
      configured: true,
      missing: [],
    });
  });
});
