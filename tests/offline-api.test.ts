import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { buildItineraryWritePayload, listItineraryItems, saveItineraryItem } from '../lib/itinerary-api';
import { buildPackingWritePayload, createPackingItem, importPackingTemplate } from '../lib/packing-api';
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

  it('omits estimated_cost when the editor leaves the optional field empty', () => {
    const payload = buildItineraryWritePayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '景點',
      category: 'spot',
      estimated_cost: null,
    });

    expect(payload).not.toHaveProperty('estimated_cost');
  });

  it('retries without estimated_cost when the remote schema has not migrated yet', async () => {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn()
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST204', message: "Could not find the 'estimated_cost' column of 'itinerary_items' in the schema cache" } })
        .mockResolvedValueOnce({ data: { id: 'item-1', trip_id: 'trip-1', location_name: '景點', category: 'spot', estimated_cost: null }, error: null }),
    };
    supabaseMock.from.mockReturnValue(query);

    const saved = await saveItineraryItem({
      id: 'item-1',
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '景點',
      category: 'spot',
      estimated_cost: 300,
    }, { offlineScope: scope, store: createMemoryOfflineStore() });

    expect(query.update).toHaveBeenCalledTimes(2);
    expect(query.update.mock.calls[0][0]).toHaveProperty('estimated_cost', 300);
    expect(query.update.mock.calls[1][0]).not.toHaveProperty('estimated_cost');
    expect(saved.id).toBe('item-1');
  });

  it('queues a packing create and returns an optimistic item offline', async () => {
    const store = createMemoryOfflineStore();
    supabaseMock.from.mockReturnValue({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new TypeError('Failed to fetch') }) }) }) });

    const item = await createPackingItem({ trip_id: 'trip-1', category: '電子產品', name: '行動電源' }, { offlineScope: scope, store });

    expect(item.id).toMatch(/^offline-/);
    await expect(store.listMutations(scope)).resolves.toMatchObject([{ entity: 'packing', operation: 'create', resourceId: item.id, status: 'pending' }]);
  });

  it('does not create a duplicate packing item when the name and category already exist', async () => {
    const existing = { id: 'packing-1', trip_id: 'trip-1', category: 'Electronics', name: 'Power bank', is_checked: false, assigned_to: null, created_at: 'now' };

    const item = await createPackingItem(
      { trip_id: 'trip-1', category: 'Electronics', name: ' power bank ' },
      { offlineScope: scope, store: createMemoryOfflineStore(), existingItems: [existing] } as any,
    );

    expect(item).toEqual(existing);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('builds packing writes with only columns supported by packing_items', () => {
    expect(buildPackingWritePayload({
      trip_id: 'trip-1',
      category: '證件',
      name: '護照',
      is_checked: true,
      assigned_to: 'user-1',
      assigned_to_all: true,
      item_name: 'legacy name',
      is_packed: true,
    })).toEqual({
      trip_id: 'trip-1',
      category: '證件',
      name: '護照',
      is_checked: true,
      assigned_to: 'user-1',
      assigned_to_all: true,
    });
  });

  it('uses the schema-safe payload for a real packing insert', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'packing-2', trip_id: 'trip-1', category: '證件', name: '護照', is_checked: false, assigned_to: null, assigned_to_all: true, created_at: 'now' }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    supabaseMock.from.mockReturnValue({ insert });

    await createPackingItem({ trip_id: 'trip-1', category: '證件', name: '護照', assigned_to_all: true }, { existingItems: [], offlineScope: scope, store: createMemoryOfflineStore() });

    expect(insert).toHaveBeenCalledWith({
      trip_id: 'trip-1',
      category: '證件',
      name: '護照',
      is_checked: false,
      assigned_to: null,
      assigned_to_all: true,
    });
  });

  it('imports a template without legacy item_name or is_packed columns', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabaseMock.from.mockReturnValue({ insert });

    await importPackingTemplate('trip-1', '日韓都市', { existingItems: [], offlineScope: scope, store: createMemoryOfflineStore() });

    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(['assigned_to', 'assigned_to_all', 'category', 'is_checked', 'name', 'trip_id']);
    expect(rows.some((row) => row.assigned_to_all === true)).toBe(true);
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
