import { describe, expect, it } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { createLocalId, emptyOfflineSnapshot, patchOfflineSnapshot, enqueueOfflineMutation } from '../lib/offline-data';

describe('offline data helpers', () => {
  it('merges collection patches without dropping existing cached data', async () => {
    const store = createMemoryOfflineStore();
    const scope = { userId: 'user-1', tripId: 'trip-1' };
    await store.putSnapshot(scope, { ...emptyOfflineSnapshot(), trip: { id: 'trip-1' }, itineraryItems: [{ id: 'item-1' }], savedAt: 'before' });

    await patchOfflineSnapshot(store, scope, { expenses: [{ id: 'expense-1' }] });

    await expect(store.getSnapshot(scope)).resolves.toMatchObject({ trip: { id: 'trip-1' }, itineraryItems: [{ id: 'item-1' }], expenses: [{ id: 'expense-1' }] });
  });

  it('creates local ids and queues a pending mutation with a timestamp', async () => {
    const store = createMemoryOfflineStore();
    const scope = { userId: 'user-1', tripId: 'trip-1' };
    const id = createLocalId('item');
    await enqueueOfflineMutation(store, { scope, entity: 'itinerary', operation: 'create', resourceId: id, payload: { id } }, new Date('2026-09-06T00:00:00.000Z'));

    await expect(store.listMutations(scope)).resolves.toMatchObject([{ entity: 'itinerary', operation: 'create', resourceId: id, status: 'pending', clientTimestamp: '2026-09-06T00:00:00.000Z' }]);
  });
});
