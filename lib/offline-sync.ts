import { offlineStore, type OfflineMutation, type OfflineScope, type OfflineStore } from './offline-store';

export type OfflineMutationExecutor = (mutation: OfflineMutation) => Promise<void>;
export type ConflictResolution = 'keep-local' | 'use-remote';
export type OfflineSyncOptions = {
  store?: OfflineStore;
  execute: OfflineMutationExecutor;
  now?: () => Date;
  sync?: (scope: OfflineScope) => Promise<void>;
};

function errorDetails(error: unknown): { message: string; code?: string } {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown };
    return { message: String(value.message ?? error), ...(value.code ? { code: String(value.code) } : {}) };
  }
  return { message: String(error) };
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = errorDetails(error).message.toLowerCase();
  return /failed to fetch|network request failed|network error|fetch failed|offline|timed out|timeout/i.test(message);
}

function mutationResourceKey(mutation: OfflineMutation): string {
  return `${mutation.entity}:${mutation.resourceId}`;
}

function compareNewest(left: OfflineMutation, right: OfflineMutation): number {
  const timestamp = right.clientTimestamp.localeCompare(left.clientTimestamp);
  return timestamp || right.id.localeCompare(left.id);
}

export function createLocalId(prefix: string, now = new Date()): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createOfflineSyncService(options: OfflineSyncOptions) {
  const store = options.store ?? offlineStore;
  const now = options.now ?? (() => new Date());

  async function sync(scope: OfflineScope): Promise<void> {
    const pending = await store.listMutations(scope, 'pending');
    const newestByResource = new Map<string, OfflineMutation>();
    for (const mutation of pending) {
      const key = mutationResourceKey(mutation);
      const current = newestByResource.get(key);
      if (!current) {
        newestByResource.set(key, mutation);
      } else if (mutation.clientTimestamp > current.clientTimestamp || (mutation.clientTimestamp === current.clientTimestamp && mutation.id > current.id)) {
        await store.removeMutation(current.id);
        newestByResource.set(key, mutation);
      } else {
        await store.removeMutation(mutation.id);
      }
    }

    for (const mutation of [...newestByResource.values()].sort(compareNewest)) {
      try {
        await options.execute(mutation);
        await store.removeMutation(mutation.id);
      } catch (error) {
        await store.updateMutation({ ...mutation, status: 'conflict', error: errorDetails(error) });
      }
    }
  }

  return {
    enqueue(mutation: Omit<OfflineMutation, 'id' | 'clientTimestamp' | 'status'>) {
      const timestamp = now().toISOString();
      return store.enqueueMutation({ ...mutation, id: createLocalId('offline-mutation', now()), clientTimestamp: timestamp, status: 'pending' });
    },
    sync,
    listConflicts(scope: OfflineScope) { return store.listMutations(scope, 'conflict'); },
    resolveConflict: async (id: string, resolution: ConflictResolution) => {
      const mutation = await store.getMutation(id);
      if (!mutation) return;
      if (resolution === 'use-remote') return store.removeMutation(id);
      await store.updateMutation({ ...mutation, status: 'pending', error: undefined, clientTimestamp: now().toISOString() });
    },
    startOnlineSync(scope: OfflineScope) {
      if (typeof globalThis.addEventListener !== 'function') return () => undefined;
      const onlineHandler = () => { void (options.sync ? options.sync(scope) : sync(scope)); };
      globalThis.addEventListener('online', onlineHandler);
      return () => globalThis.removeEventListener?.('online', onlineHandler);
    },
  };
}
