import { describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { createOfflineSyncService, isNetworkError } from '../lib/offline-sync';
import { moveItineraryItemAcrossDays } from '../lib/itinerary-move';
import { applyItineraryOrder, type ItineraryItem } from '../lib/itinerary';

const scope = { userId: 'user-1', tripId: 'trip-1' };

describe('offline sync', () => {
  it('replays a cross-day move before its subsequent reorder', async () => {
    const store = createMemoryOfflineStore();
    let items = [{ id: 'a', trip_id: 'trip-1', day_number: 1, position: 0 }, { id: 'b', trip_id: 'trip-1', day_number: 2, position: 0 }] as ItineraryItem[];
    await store.enqueueMutation({ id: 'move', scope, entity: 'itinerary', operation: 'move-day', resourceId: 'a', payload: { targetDay: 2 }, clientTimestamp: '2026-10-12T00:00:00Z', status: 'pending' });
    await store.enqueueMutation({ id: 'order', scope, entity: 'itinerary', operation: 'reorder', resourceId: 'a,b', payload: [{ id: 'a', position: 0 }, { id: 'b', position: 1 }], clientTimestamp: '2026-10-12T00:00:01Z', status: 'pending' });
    const service = createOfflineSyncService({ store, execute: async (mutation) => {
      items = mutation.operation === 'move-day' ? moveItineraryItemAcrossDays(items, 'a', 2) : applyItineraryOrder(items, mutation.payload as { id: string; position: number }[]);
    } });
    await service.sync(scope);
    expect(items.find((item) => item.id === 'a')).toMatchObject({ day_number: 2, position: 0 });
    expect(items.find((item) => item.id === 'b')?.position).toBe(1);
  });
  it('does not coalesce a move and a field edit of the same itinerary item', async () => {
    const store = createMemoryOfflineStore();
    await store.enqueueMutation({ id: 'move', scope, entity: 'itinerary', operation: 'move-day', resourceId: 'a', payload: { targetDay: 2 }, clientTimestamp: '2026-10-12T00:00:00Z', status: 'pending' });
    await store.enqueueMutation({ id: 'edit', scope, entity: 'itinerary', operation: 'update', resourceId: 'a', payload: { notes: 'bring tickets' }, clientTimestamp: '2026-10-12T00:00:01Z', status: 'pending' });
    const operations: string[] = [];
    const service = createOfflineSyncService({ store, execute: async (mutation) => { operations.push(mutation.operation); } });
    await service.sync(scope);
    expect(operations).toEqual(['move-day', 'update']);
  });
  it('retains an intermediate move when a reorder depends on that intermediate day', async () => {
    const store = createMemoryOfflineStore();
    let items = [{ id: 'a', trip_id: 'trip-1', day_number: 1, position: 0 }, { id: 'b', trip_id: 'trip-1', day_number: 2, position: 0 }] as ItineraryItem[];
    const steps = [
      { id: 'move-1', operation: 'move-day' as const, resourceId: 'a', payload: { targetDay: 2 } },
      { id: 'order', operation: 'reorder' as const, resourceId: 'a,b', payload: [{ id: 'a', position: 0 }, { id: 'b', position: 1 }] },
      { id: 'move-2', operation: 'move-day' as const, resourceId: 'a', payload: { targetDay: 3 } },
    ];
    for (const [index, step] of steps.entries()) await store.enqueueMutation({ ...step, scope, entity: 'itinerary', clientTimestamp: `2026-10-12T00:00:0${index}Z`, status: 'pending' });
    const service = createOfflineSyncService({ store, execute: async (mutation) => {
      items = mutation.operation === 'move-day'
        ? moveItineraryItemAcrossDays(items, 'a', (mutation.payload as { targetDay: number }).targetDay)
        : applyItineraryOrder(items, mutation.payload as { id: string; position: number }[]);
    } });
    await service.sync(scope);
    expect(items.find((item) => item.id === 'a')?.day_number).toBe(3);
    expect(items.find((item) => item.id === 'b')?.position).toBe(0);
  });
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

  it('does not replay the same scope twice when online events overlap', async () => {
    const store = createMemoryOfflineStore();
    await store.enqueueMutation({ id: 'move-1', scope, entity: 'itinerary', operation: 'move-day', resourceId: 'item-1', payload: { targetDay: 2 }, clientTimestamp: '2026-09-06T00:00:00.000Z', status: 'pending' });
    let releaseExecution!: () => void;
    const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve; });
    const execute = vi.fn(() => executionGate);
    const service = createOfflineSyncService({ store, execute });

    const firstSync = service.sync(scope);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const overlappingSync = service.sync(scope);
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    releaseExecution();
    await Promise.all([firstSync, overlappingSync]);
    await expect(store.listMutations(scope)).resolves.toEqual([]);
  });

  it('runs one follow-up pass when new mutations arrive during an active sync', async () => {
    const store = createMemoryOfflineStore();
    await store.enqueueMutation({ id: 'move-1', scope, entity: 'itinerary', operation: 'move-day', resourceId: 'item-1', payload: { targetDay: 2 }, clientTimestamp: '2026-09-06T00:00:00.000Z', status: 'pending' });
    let releaseExecution!: () => void;
    const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve; });
    const executedIds: string[] = [];
    const execute = vi.fn(async (mutation) => {
      executedIds.push(mutation.id);
      if (mutation.id === 'move-1') await executionGate;
    });
    const service = createOfflineSyncService({ store, execute });

    const firstSync = service.sync(scope);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    await store.enqueueMutation({ id: 'expense-1', scope, entity: 'expense', operation: 'create', resourceId: 'expense-1', payload: {}, clientTimestamp: '2026-09-06T00:01:00.000Z', status: 'pending' });
    const followUpSync = service.sync(scope);
    releaseExecution();
    await Promise.all([firstSync, followUpSync]);

    expect(executedIds).toEqual(['move-1', 'expense-1']);
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

  it('captures sync failures triggered by the online event listener', async () => {
    const store = createMemoryOfflineStore();
    const sync = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    const service = createOfflineSyncService({ store, execute: async () => undefined, sync });
    const add = vi.fn();
    const remove = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: add });
    Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: remove });

    const stop = service.startOnlineSync(scope);
    const onlineHandler = add.mock.calls.find(([type]) => type === 'online')?.[1] as (() => void) | undefined;
    onlineHandler?.();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[OfflineSync] online sync failed', expect.any(Error)));

    stop();
    errorSpy.mockRestore();
  });
});
