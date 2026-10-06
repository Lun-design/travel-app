import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

const scope = { userId: 'user-1', tripId: 'trip-1' };
const item = (id: string, day_number: number, position: number) => ({
  id, trip_id: 'trip-1', day_number, position, time: '10:30', location_name: id,
  address: null, latitude: null, longitude: null, notes: null, category: 'spot', created_by: 'user-1',
});

describe('cross-day itinerary move API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists one move through the atomic RPC and updates the offline snapshot', async () => {
    const store = createMemoryOfflineStore();
    await store.putSnapshot(scope, {
      trip: null, members: [], itineraryItems: [item('a', 1, 0), item('b', 1, 1), item('c', 2, 0)],
      packingItems: [], expenses: [], vouchers: [], savedAt: '',
    });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const { moveItineraryItemToDay } = await import('../lib/itinerary-api');

    await moveItineraryItemToDay('b', 2, { offlineScope: scope, store });

    expect(supabaseMock.rpc).toHaveBeenCalledOnce();
    expect(supabaseMock.rpc).toHaveBeenCalledWith('move_itinerary_item_to_day', {
      p_item_id: 'b', p_target_day_number: 2,
    });
    expect((await store.getSnapshot(scope))?.itineraryItems).toMatchObject([
      { id: 'a', day_number: 1, position: 0 },
      { id: 'b', day_number: 2, position: 1 },
      { id: 'c', day_number: 2, position: 0 },
    ]);
  });

  it('queues and applies a move to the local snapshot when the RPC is offline', async () => {
    const store = createMemoryOfflineStore();
    await store.putSnapshot(scope, {
      trip: null, members: [], itineraryItems: [item('a', 1, 0), item('b', 1, 1), item('c', 2, 0)],
      packingItems: [], expenses: [], vouchers: [], savedAt: '',
    });
    supabaseMock.rpc.mockResolvedValue({ data: null, error: new TypeError('Failed to fetch') });
    const { moveItineraryItemToDay } = await import('../lib/itinerary-api');

    await expect(moveItineraryItemToDay('b', 2, { offlineScope: scope, store })).resolves.toBeUndefined();

    expect(await store.listMutations(scope)).toMatchObject([{
      entity: 'itinerary', operation: 'move-day', resourceId: 'b', payload: { targetDay: 2 }, status: 'pending',
    }]);
    expect((await store.getSnapshot(scope))?.itineraryItems).toMatchObject([
      { id: 'a', day_number: 1, position: 0 },
      { id: 'b', day_number: 2, position: 1 },
      { id: 'c', day_number: 2, position: 0 },
    ]);
  });

  it('does not hide authenticated RPC failures as offline moves', async () => {
    const error = { code: '42501', message: 'Not authorized' };
    supabaseMock.rpc.mockResolvedValue({ data: null, error });
    const { moveItineraryItemToDay } = await import('../lib/itinerary-api');

    await expect(moveItineraryItemToDay('b', 2, { offlineScope: scope, store: createMemoryOfflineStore() })).rejects.toBe(error);
  });
});
