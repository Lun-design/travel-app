import { createLocalId as createQueueId, isNetworkError } from './offline-sync';
import { offlineStore, type OfflineEntity, type OfflineMutationOperation, type OfflineScope, type OfflineSnapshot, type OfflineStore } from './offline-store';

export type OfflineCollection = 'members' | 'itineraryItems' | 'packingItems' | 'expenses' | 'vouchers';
export type OfflineApiOptions = { offlineScope?: OfflineScope; store?: OfflineStore; replaying?: boolean };

export function emptyOfflineSnapshot(): OfflineSnapshot {
  return { trip: null, members: [], itineraryItems: [], packingItems: [], expenses: [], vouchers: [], savedAt: '' };
}

export function createLocalId(prefix: string): string {
  return createQueueId(prefix);
}

export async function patchOfflineSnapshot(store: OfflineStore, scope: OfflineScope, patch: Partial<OfflineSnapshot>): Promise<OfflineSnapshot> {
  const current = await store.getSnapshot(scope);
  const next = { ...emptyOfflineSnapshot(), ...(current ?? {}), ...patch, savedAt: new Date().toISOString() };
  await store.putSnapshot(scope, next);
  return next;
}

export async function updateOfflineCollection<T>(store: OfflineStore, scope: OfflineScope, collection: OfflineCollection, updater: (items: T[]) => T[]): Promise<OfflineSnapshot> {
  const current = await store.getSnapshot(scope) ?? emptyOfflineSnapshot();
  const items = (current[collection] as T[] | undefined) ?? [];
  return patchOfflineSnapshot(store, scope, { [collection]: updater(items) });
}

export async function enqueueOfflineMutation(
  store: OfflineStore,
  input: { scope: OfflineScope; entity: OfflineEntity; operation: OfflineMutationOperation; resourceId: string; payload: unknown },
  now = new Date(),
): Promise<void> {
  await store.enqueueMutation({ ...input, id: createLocalId('mutation'), clientTimestamp: now.toISOString(), status: 'pending' });
}

export async function resolveOfflineScope(tripId: string, explicit?: OfflineScope, getUserId?: () => Promise<string | null>): Promise<OfflineScope> {
  if (explicit) return explicit;
  try {
    return { userId: (await getUserId?.()) ?? 'anonymous', tripId };
  } catch {
    return { userId: 'anonymous', tripId };
  }
}

export function shouldQueueOffline(error: unknown): boolean {
  return isNetworkError(error);
}

export { offlineStore };
