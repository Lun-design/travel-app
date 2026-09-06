import { describe, expect, it } from 'vitest';
import { createMemoryOfflineStore, type OfflineMutation, type OfflineSnapshot } from '../lib/offline-store';

const scope = { userId: 'user-1', tripId: 'trip-1' };

describe('offline store', () => {
  it('keeps snapshots isolated by user and trip scope', async () => {
    const store = createMemoryOfflineStore();
    const snapshot: OfflineSnapshot = { trip: { id: 'trip-1' }, itineraryItems: [], packingItems: [], expenses: [], members: [], vouchers: [], savedAt: '2026-09-06T00:00:00.000Z' };

    await store.putSnapshot(scope, snapshot);

    await expect(store.getSnapshot(scope)).resolves.toEqual(snapshot);
    await expect(store.getSnapshot({ userId: 'user-2', tripId: 'trip-1' })).resolves.toBeNull();
  });

  it('persists and removes queued mutations', async () => {
    const store = createMemoryOfflineStore();
    const mutation: OfflineMutation = {
      id: 'mutation-1',
      scope,
      entity: 'itinerary',
      operation: 'create',
      resourceId: 'local-item-1',
      payload: { trip_id: 'trip-1', location_name: '離線景點' },
      clientTimestamp: '2026-09-06T00:00:00.000Z',
      status: 'pending',
    };

    await store.enqueueMutation(mutation);
    await expect(store.listMutations(scope)).resolves.toEqual([mutation]);
    await store.removeMutation(mutation.id);
    await expect(store.listMutations(scope)).resolves.toEqual([]);
  });

  it('clears private snapshots and mutations without affecting unrelated scopes', async () => {
    const store = createMemoryOfflineStore();
    await store.putSnapshot(scope, { trip: { id: 'trip-1' }, itineraryItems: [], packingItems: [], expenses: [], members: [], vouchers: [], savedAt: 'now' });
    await store.enqueueMutation({ id: 'mutation-1', scope, entity: 'expense', operation: 'delete', resourceId: 'expense-1', payload: {}, clientTimestamp: 'now', status: 'pending' });
    const otherScope = { userId: 'user-2', tripId: 'trip-2' };
    await store.putSnapshot(otherScope, { trip: { id: 'trip-2' }, itineraryItems: [], packingItems: [], expenses: [], members: [], vouchers: [], savedAt: 'now' });

    await store.clearScope(scope);

    await expect(store.getSnapshot(scope)).resolves.toBeNull();
    await expect(store.listMutations(scope)).resolves.toEqual([]);
    await expect(store.getSnapshot(otherScope)).resolves.toBeTruthy();
  });

  it('lists cached trips for one user without crossing user boundaries', async () => {
    const store = createMemoryOfflineStore();
    await store.putSnapshot(scope, { trip: { id: 'trip-1' }, itineraryItems: [], packingItems: [], expenses: [], members: [], vouchers: [], savedAt: 'now' });
    await store.putSnapshot({ userId: 'user-2', tripId: 'trip-2' }, { trip: { id: 'trip-2' }, itineraryItems: [], packingItems: [], expenses: [], members: [], vouchers: [], savedAt: 'now' });

    await expect(store.listSnapshots('user-1')).resolves.toHaveLength(1);
  });
});
