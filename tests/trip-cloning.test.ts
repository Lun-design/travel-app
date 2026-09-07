import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import { cloneTripById } from '../lib/trip-cloning';

describe('trip cloning', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the atomic clone RPC with the source trip and optional share token', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'new-trip-id', error: null } as never);

    await expect(cloneTripById('source-trip-id', { shareToken: 'public-token' })).resolves.toBe('new-trip-id');
    expect(supabase.rpc).toHaveBeenCalledWith('clone_trip_by_id', {
      p_trip_id: 'source-trip-id',
      p_share_token: 'public-token',
    });
  });

  it('rejects RPC errors instead of reporting a partial clone', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('permission denied') } as never);

    await expect(cloneTripById('source-trip-id')).rejects.toThrow('permission denied');
  });

  it('keeps cloning permission checks and all child inserts inside the SECURITY DEFINER function', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260908000000_trip_cloning.sql'), 'utf8');

    expect(migration).toContain('create or replace function public.clone_trip_by_id');
    expect(migration).toContain('security definer');
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('private.is_trip_member');
    expect(migration).toContain('p_share_token');
    expect(migration).toContain('insert into public.itinerary_items');
    expect(migration).toContain('insert into public.trip_places');
    expect(migration).toContain('insert into public.packing_items');
    expect(migration).toContain('grant execute on function public.clone_trip_by_id(uuid, text) to authenticated');
    expect(migration).not.toContain('grant execute on function public.clone_trip_by_id(uuid, text) to anon');
  });

  it('exposes clone actions on the public share page and trip list', () => {
    const sharePage = readFileSync(resolve(process.cwd(), 'src/app/share/[token].tsx'), 'utf8');
    const tripList = readFileSync(resolve(process.cwd(), 'src/app/index.tsx'), 'utf8');

    expect(sharePage).toContain('cloneTripById');
    expect(sharePage).toContain('複製此行程到我的帳號');
    expect(sharePage).toContain('router.push');
    expect(tripList).toContain('cloneTripById');
    expect(tripList).toContain('複製行程');
  });
});
