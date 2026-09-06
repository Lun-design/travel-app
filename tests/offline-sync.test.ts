import { describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { createOfflineSyncService, isNetworkError } from '../lib/offline-sync';

const scope = { userId: 'user-1', tripId: 'trip-1' };

describe('offline sync', () => {
  it('recognizes network failures but not Supabase validation errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('JWT expired'))).toBe(false);
    expect(isNetworkError({ message: 'network request failed', code: 'PGRST116' })).toBe(true);
  });

  it('coalesces same-resource mutations and executes newest pending changes first', async () => {
    const store = createMemoryOfflineStore();
    await store.enqueueMutation({ id: 'old', scope, entity: 'packing', operation: 'update', resourceId: 'item-1', payload: { is_checked: false }, clientTimestamp: '2026-09-06T00:00:00.000Z', status: 'pending' });
    await store.enqueueMutation({ id: 'new', scope, entity: 'packing', operation: 'update', resourceId: 'item-1', payload: { is_checked: true }, clientTimestamp: '2026-09-06T00:01:00.000Z', status: 'pending' });
    await store.enqueueMutation({ id: 'other', scope, entity: 'expense', operation: 'delete', resourceId: 'expense-1', payload: {}, clientTimestamp: '2026-09-06T00:02:00.000Z', status: 'pending' });
    const execute = vi.fn(async () => undefined);
    const service = createOfflineSyncService({ store, execute });

    await service.sync(scope);

    expect(execute).toHaveBeenCalledTimes(2);
    expect((execute.mock.calls as unknown as Array<[any]>).map(([mutation]) => mutation.id)).toEqual(['other', 'new']);
    await expect(store.listMutations(scope)).resolves.toEqual([]);
  });

  it('retains a conflict and allows choosing local or remote resolution', async () => {
    const store = createMemoryOfflineStore();
    await store.enqueueMutation({ id: 'conflict-1', scope, entity: 'itinerary', operation: 'update', resourceId: 'item-1', payload: { location_name: '本機' }, clientTimestamp: '2026-09-06T00:00:00.000Z', status: 'pending' });
    const service = createOfflineSyncService({ store, execute: async () => { throw new Error('409 conflict'); } });

    await service.sync(scope);
    await expect(service.listConflicts(scope)).resolves.toHaveLength(1);
    await service.resolveConflict('conflict-1', 'keep-local');
    await expect(store.listMutations(scope)).resolves.toMatchObject([{ id: 'conflict-1', status: 'pending' }]);

    await service.sync(scope);
    await service.resolveConflict('conflict-1', 'use-remote');
    await expect(service.listConflicts(scope)).resolves.toEqual([]);
  });

  it('syncs when the browser reports that it is online', async () => {
    const store = createMemoryOfflineStore();
    const sync = vi.fn(async () => undefined);
    const service = createOfflineSyncService({ store, execute: async () => undefined, sync });
    const add = vi.fn();
    const remove = vi.fn();
    Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: add });
    Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: remove });

    const stop = service.startOnlineSync(scope);
    const onlineHandler = add.mock.calls.find(([type]) => type === 'online')?.[1] as (() => void) | undefined;
    onlineHandler?.();
    await Promise.resolve();

    expect(sync).toHaveBeenCalledWith(scope);
    stop();
    expect(remove).toHaveBeenCalledWith('online', onlineHandler);
  });
});
