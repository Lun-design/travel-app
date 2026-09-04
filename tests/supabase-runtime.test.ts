import { describe, expect, it } from 'vitest';
import { getSupabaseAuthOptions, getRealtimeOptions, NoopWebSocket } from '../lib/supabase-runtime';

describe('Supabase realtime runtime options', () => {
  it('uses a safe transport when the runtime has no WebSocket', () => {
    const options = getRealtimeOptions({});

    expect(options.transport).toBe(NoopWebSocket);
  });
});

describe('Supabase auth runtime options', () => {
  it('disables browser session features during Node static rendering', () => {
    expect(getSupabaseAuthOptions({})).toEqual({
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    });
  });

  it('enables persistence and URL detection in a browser', () => {
    expect(getSupabaseAuthOptions({ window: {}, navigator: {} })).toEqual({
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    });
  });

  it('keeps native persistence without browser URL detection', () => {
    expect(getSupabaseAuthOptions({ navigator: { product: 'ReactNative' } })).toEqual({
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    });
  });
});
