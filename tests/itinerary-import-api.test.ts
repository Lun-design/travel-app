import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn(), auth: { getSession: vi.fn() } } }));
vi.mock('../lib/google-places', () => ({ hasGooglePlacesApiKey: () => true, searchGooglePlacesText: vi.fn() }));
vi.mock('../lib/geocoding', () => ({ searchNominatim: vi.fn(), searchPlaces: vi.fn().mockResolvedValue([{ title: '海遊館', latitude: NaN, longitude: NaN }]) }));
vi.mock('../lib/offline-store', async (original) => {
  const mod = await original<typeof import('../lib/offline-store')>();
  return { ...mod, offlineStore: mod.createMemoryOfflineStore() };
});
import { importTripItems, clearTripItems } from '../lib/itinerary-import-api';
import { supabase } from '../lib/supabase';
import { searchGooglePlacesText } from '../lib/google-places';
import { offlineStore } from '../lib/offline-store';

const scope = { userId: 'user', tripId: 'trip' };
const item = { location_name: '海遊館', address: null, latitude: null, longitude: null, day_number: 1, time: '09:00', duration_minutes: 60, category: 'spot', notes: null };
beforeEach(async () => {
  vi.clearAllMocks(); await offlineStore.clearAll();
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'user' } } } } as never);
  vi.mocked(searchGooglePlacesText).mockResolvedValue([{ id: 'p', title: '海遊館', displayName: '大阪海岸通', latitude: 34.65, longitude: 135.42 }]);
});
it('uses Text Search coordinates rather than coordinate-less Autocomplete predictions', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: { items: [{ ...item, id: 'saved', latitude: 34.65, longitude: 135.42 }], saved: 1, skipped: 0, removed: 0 }, error: null } as never);
  await importTripItems({ tripId: 'trip', mode: 'merge', items: [item], destination: '大阪', dayCount: 1 });
  expect(searchGooglePlacesText).toHaveBeenCalledWith('大阪 海遊館');
  expect(supabase.rpc).toHaveBeenCalledWith('import_itinerary_items', expect.objectContaining({ p_items: [expect.objectContaining({ latitude: 34.65, longitude: 135.42 })] }));
  expect((await offlineStore.getSnapshot(scope))?.itineraryItems[0]).toMatchObject({ id: 'saved' });
});
it('updates only itinerary cache after successful clear and preserves it on RPC failure', async () => {
  const snapshot = { trip: null, members: [], itineraryItems: [item], packingItems: ['packing'], expenses: ['expense'], vouchers: [], savedAt: '' };
  await offlineStore.putSnapshot(scope, snapshot);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'denied' } } as never);
  await expect(clearTripItems('trip')).rejects.toThrow('denied');
  expect((await offlineStore.getSnapshot(scope))?.itineraryItems).toEqual([item]);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: { items: [], saved: 0, skipped: 0, removed: 1 }, error: null } as never);
  await clearTripItems('trip');
  expect(await offlineStore.getSnapshot(scope)).toMatchObject({ itineraryItems: [], packingItems: ['packing'], expenses: ['expense'] });
});
it('does not clear while queued offline itinerary mutations could resurrect deleted items', async () => {
  await offlineStore.enqueueMutation({ id: 'queued', scope, entity: 'itinerary', operation: 'create', resourceId: 'local', payload: {}, clientTimestamp: '', status: 'pending' });
  await expect(clearTripItems('trip')).rejects.toThrow('離線變更');
  expect(supabase.rpc).not.toHaveBeenCalled();
});
it('keeps destructive operations trip-scoped, transactional and under RLS', () => {
  const sql = readFileSync('supabase/migrations/20260914000000_atomic_itinerary_import.sql', 'utf8');
  expect(sql).toContain('security invoker');
  expect(sql).toContain('private.can_edit_trip(p_trip_id)');
  expect(sql).toContain('delete from public.itinerary_items where trip_id = p_trip_id');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).not.toMatch(/exception\s+when/i);
  expect(sql).not.toContain('to anon');
});
