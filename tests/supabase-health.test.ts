import { describe, expect, it } from 'vitest';
import { buildSupabaseHealthcheckUrl } from '../lib/supabase-health';

describe('Supabase healthcheck URL', () => {
  it('uses an authenticated service endpoint instead of the REST schema root', () => {
    expect(buildSupabaseHealthcheckUrl('https://example.supabase.co/')).toBe(
      'https://example.supabase.co/auth/v1/settings',
    );
  });
});
