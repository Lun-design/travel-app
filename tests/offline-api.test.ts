import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { listItineraryItems, saveItineraryItem } from '../lib/itinerary-api';
import { createPackingItem } from '../lib/packing-api';
import { saveExpense } from '../lib/expenses-api';

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), auth: { getSession: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

const scope = { userId: 'user-1', tripId: 'trip-1' };

describe('offline-aware itinerary API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a scoped cached collection when an itinerary read loses network', async () => {
    const store = createMemoryOfflineStore();
    await store.putSnapshot(scope, { trip: null, members: [], itineraryItems: [{ id: 'cached-item' }], packingItems: [], expenses: [], vouchers: [], savedAt: 'now' });
    const failedQuery = { select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: null, error: new TypeError('Failed to fetch') }) }) }) }) };
    supabaseMock.from.mockReturnValue(failedQuery);

    await expect(listItineraryItems('trip-1', { offlineScope: scope, store })).resolves.toEqual([{ id: 'cached-item' }]);
  });

  it('returns an optimistic local item and queues a create when saving offline', async () => {
    const store = createMemoryOfflineStore();
    const failedQuery = { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new TypeError('network request failed') }) }) }) };
    supabaseMock.from.mockReturnValue(failedQuery);

    const item = await saveItineraryItem({ trip_id: 'trip-1', created_by: 'user-1', day_number: 1, location_name: '離線景點', category: 'spot' }, { offlineScope: scope, store });

    expect(item.id).toMatch(/^offline-/);
    expect(item.location_name).toBe('離線景點');
    const mutations = await store.listMutations(scope);
    expect(mutations).toMatchObject([{ entity: 'itinerary', operation: 'create', resourceId: item.id, status: 'pending' }]);
    expect((mutations[0].payload as { id?: string }).id).toBeUndefined();
  });

  it('queues a packing create and returns an optimistic item offline', async () => {
    const store = createMemoryOfflineStore();
    supabaseMock.from.mockReturnValue({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new TypeError('Failed to fetch') }) }) }) });

    const item = await createPackingItem({ trip_id: 'trip-1', category: '電子產品', name: '行動電源' }, { offlineScope: scope, store });

    expect(item.id).toMatch(/^offline-/);
    await expect(store.listMutations(scope)).resolves.toMatchObject([{ entity: 'packing', operation: 'create', resourceId: item.id, status: 'pending' }]);
  });

  it('queues a valid expense create without treating UUID validation as offline', async () => {
    const store = createMemoryOfflineStore();
    supabaseMock.from.mockReturnValue({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new TypeError('network error') }) }) }) });
    const tripId = '00000000-0000-4000-8000-000000000001';
    const userId = '00000000-0000-4000-8000-000000000002';

    const expense = await saveExpense({ trip_id: tripId, payer_id: userId, title: '離線午餐', amount: 300, currency: 'TWD', category: '餐飲' }, [{ user_id: userId, amount: 300 }], { offlineScope: { userId, tripId }, store });

    expect(expense.id).toMatch(/^offline-/);
    await expect(store.listMutations({ userId, tripId })).resolves.toMatchObject([{ entity: 'expense', operation: 'create', resourceId: expense.id, status: 'pending' }]);
  });
});
