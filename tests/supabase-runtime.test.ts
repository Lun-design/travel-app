import { describe, expect, it } from 'vitest';
import { getRealtimeOptions, NoopWebSocket } from '../lib/supabase-runtime';

describe('Supabase realtime runtime options', () => {
  it('uses a safe transport when the runtime has no WebSocket', () => {
    const options = getRealtimeOptions({});

    expect(options.transport).toBe(NoopWebSocket);
  });
});
