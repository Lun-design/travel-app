export type OfflineScope = { userId: string; tripId: string };
export type OfflineSnapshot = {
  trip: unknown | null;
  members: unknown[];
  itineraryItems: unknown[];
  packingItems: unknown[];
  expenses: unknown[];
  vouchers: unknown[];
  savedAt: string;
};
export type OfflineMutationStatus = 'pending' | 'conflict';
export type OfflineEntity = 'trip' | 'itinerary' | 'packing' | 'expense';
export type OfflineMutationOperation = 'create' | 'update' | 'delete' | 'reorder';
export type OfflineMutation = {
  id: string;
  scope: OfflineScope;
  entity: OfflineEntity;
  operation: OfflineMutationOperation;
  resourceId: string;
  payload: unknown;
  clientTimestamp: string;
  status: OfflineMutationStatus;
  error?: { message: string; code?: string };
};

export type OfflineStore = {
  getSnapshot: (scope: OfflineScope) => Promise<OfflineSnapshot | null>;
  putSnapshot: (scope: OfflineScope, snapshot: OfflineSnapshot) => Promise<void>;
  listSnapshots: (userId: string) => Promise<Array<{ scope: OfflineScope; snapshot: OfflineSnapshot }>>;
  enqueueMutation: (mutation: OfflineMutation) => Promise<void>;
  getMutation: (id: string) => Promise<OfflineMutation | null>;
  listMutations: (scope: OfflineScope, status?: OfflineMutationStatus) => Promise<OfflineMutation[]>;
  updateMutation: (mutation: OfflineMutation) => Promise<void>;
  removeMutation: (id: string) => Promise<void>;
  clearScope: (scope: OfflineScope) => Promise<void>;
  clearAll: () => Promise<void>;
};

export function offlineScopeKey(scope: OfflineScope): string {
  return `${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.tripId)}`;
}

function sameScope(left: OfflineScope, right: OfflineScope): boolean {
  return left.userId === right.userId && left.tripId === right.tripId;
}

export function createMemoryOfflineStore(): OfflineStore {
  const snapshots = new Map<string, OfflineSnapshot>();
  const mutations = new Map<string, OfflineMutation>();
  return {
    async getSnapshot(scope) { return snapshots.get(offlineScopeKey(scope)) ?? null; },
    async putSnapshot(scope, snapshot) { snapshots.set(offlineScopeKey(scope), snapshot); },
    async listSnapshots(userId) { return [...snapshots.entries()].filter(([key]) => key.startsWith(`${encodeURIComponent(userId)}:`)).map(([key, snapshot]) => ({ scope: { userId, tripId: decodeURIComponent(key.split(':').slice(1).join(':')) }, snapshot })); },
    async enqueueMutation(mutation) { mutations.set(mutation.id, mutation); },
    async getMutation(id) { return mutations.get(id) ?? null; },
    async listMutations(scope, status) {
      return [...mutations.values()]
        .filter((mutation) => sameScope(mutation.scope, scope) && (!status || mutation.status === status))
        .sort((left, right) => left.clientTimestamp.localeCompare(right.clientTimestamp));
    },
    async updateMutation(mutation) { mutations.set(mutation.id, mutation); },
    async removeMutation(id) { mutations.delete(id); },
    async clearScope(scope) {
      snapshots.delete(offlineScopeKey(scope));
      [...mutations.values()].filter((mutation) => sameScope(mutation.scope, scope)).forEach((mutation) => mutations.delete(mutation.id));
    },
    async clearAll() { snapshots.clear(); mutations.clear(); },
  };
}

const DB_NAME = 'travel-planner-offline-v1';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const MUTATION_STORE = 'mutations';

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE);
      if (!database.objectStoreNames.contains(MUTATION_STORE)) database.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline database'));
  });
}

async function transactionRequest<T>(databasePromise: Promise<IDBDatabase>, storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await databasePromise;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline database request failed'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Offline database transaction failed'));
  });
}

export function createIndexedDbOfflineStore(indexedDb: IDBFactory): OfflineStore {
  const database = openDatabase(indexedDb);
  return {
    async getSnapshot(scope) { return (await transactionRequest(database, SNAPSHOT_STORE, 'readonly', (store) => store.get(offlineScopeKey(scope)))) as OfflineSnapshot | undefined ?? null; },
    async putSnapshot(scope, snapshot) { await transactionRequest(database, SNAPSHOT_STORE, 'readwrite', (store) => store.put(snapshot, offlineScopeKey(scope))); },
    async listSnapshots(userId) {
      const keys = (await transactionRequest(database, SNAPSHOT_STORE, 'readonly', (store) => store.getAllKeys())) as IDBValidKey[];
      const prefix = `${encodeURIComponent(userId)}:`;
      return (await Promise.all(keys.filter((key): key is string => typeof key === 'string' && key.startsWith(prefix)).map(async (key) => ({ scope: { userId, tripId: decodeURIComponent(key.slice(prefix.length)) }, snapshot: (await transactionRequest(database, SNAPSHOT_STORE, 'readonly', (store) => store.get(key))) as OfflineSnapshot }))));
    },
    async enqueueMutation(mutation) { await transactionRequest(database, MUTATION_STORE, 'readwrite', (store) => store.put(mutation)); },
    async getMutation(id) { return (await transactionRequest(database, MUTATION_STORE, 'readonly', (store) => store.get(id))) as OfflineMutation | undefined ?? null; },
    async listMutations(scope, status) {
      const all = (await transactionRequest(database, MUTATION_STORE, 'readonly', (store) => store.getAll())) as OfflineMutation[];
      return all.filter((mutation) => sameScope(mutation.scope, scope) && (!status || mutation.status === status)).sort((left, right) => left.clientTimestamp.localeCompare(right.clientTimestamp));
    },
    async updateMutation(mutation) { await transactionRequest(database, MUTATION_STORE, 'readwrite', (store) => store.put(mutation)); },
    async removeMutation(id) { await transactionRequest(database, MUTATION_STORE, 'readwrite', (store) => store.delete(id)); },
    async clearScope(scope) {
      await transactionRequest(database, SNAPSHOT_STORE, 'readwrite', (store) => store.delete(offlineScopeKey(scope)));
      const mutations = (await transactionRequest(database, MUTATION_STORE, 'readonly', (store) => store.getAll())) as OfflineMutation[];
      await Promise.all(mutations.filter((mutation) => sameScope(mutation.scope, scope)).map((mutation) => transactionRequest(database, MUTATION_STORE, 'readwrite', (store) => store.delete(mutation.id))));
    },
    async clearAll() {
      await transactionRequest(database, SNAPSHOT_STORE, 'readwrite', (store) => store.clear());
      await transactionRequest(database, MUTATION_STORE, 'readwrite', (store) => store.clear());
    },
  };
}

export function createOfflineStore(): OfflineStore {
  if (typeof indexedDB === 'undefined') return createMemoryOfflineStore();
  return createIndexedDbOfflineStore(indexedDB);
}

export const offlineStore = createOfflineStore();
