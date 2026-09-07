import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import {
  buildTripShareUrl,
  createShareToken,
  createTripShare,
  normalizePublicSharePayload,
  revokeTripShare,
} from '../lib/trip-share-api';

describe('trip sharing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a URL-safe token with stable length', () => {
    const token = createShareToken(() => 0);
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(buildTripShareUrl(token, 'https://planner.example')).toBe('https://planner.example/share/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  it('creates a share with expenses hidden by default', async () => {
    const query = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'share-1', trip_id: 'trip-1', share_token: 'token', is_active: true, include_expenses: false, created_by: 'user-1' }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(query as never);

    const result = await createTripShare({ trip_id: 'trip-1', created_by: 'user-1' }, () => 0);

    expect(result.include_expenses).toBe(false);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: 'trip-1', created_by: 'user-1', include_expenses: false }));
  });

  it('keeps public payload read-only and isolates expenses when disabled', () => {
    const payload = normalizePublicSharePayload({
      share: { id: 'share-1', trip_id: 'trip-1', share_token: 'token', is_active: true, include_expenses: false },
      trip: { id: 'trip-1', title: 'Japan', destination: 'Tokyo', start_date: '2026-10-01', end_date: '2026-10-03' },
      items: [{ id: 'item-1', trip_id: 'trip-1', day_number: 1, time: '09:00', location_name: '浅草寺', category: 'spot' }],
      expenses: [{ id: 'secret-expense', amount: 9999 }],
    });

    expect(payload).toMatchObject({ trip: { id: 'trip-1', title: 'Japan' }, items: [{ id: 'item-1', location_name: '浅草寺' }] });
    expect(payload?.expenses).toEqual([]);
    expect(payload?.trip).not.toHaveProperty('created_by');
  });

  it('revokes a share by id and trip scope', async () => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'share-1', is_active: false }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(query as never);

    await revokeTripShare('share-1', 'trip-1');

    expect(query.update).toHaveBeenCalledWith({ is_active: false });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'share-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'trip_id', 'trip-1');
  });

  it('restricts public reads to active tokens and keeps writes authenticated', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260907030000_trip_shares.sql'), 'utf8');
    expect(migration).not.toContain('grant select on public.trip_shares to anon');
    expect(migration).toContain('created_by = auth.uid()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('grant execute on function public.get_public_trip_by_share_token(text) to anon, authenticated');
  });
});
