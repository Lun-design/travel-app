const RUNTIME_CACHE_PREFIX = 'travel-planner-runtime-';
const OFFLINE_STORAGE_PREFIX = 'travel-planner-offline:';

type ServiceWorkerController = { postMessage: (message: unknown) => void };

function getStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function getController(): ServiceWorkerController | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.serviceWorker?.controller ?? null;
}

/**
 * Remove browser-side private data without touching the persisted theme mode.
 * Static assets are deliberately retained so the PWA shell can still open.
 */
export async function clearOfflineCache(): Promise<void> {
  const cacheStorage = typeof caches === 'undefined' ? null : caches;
  if (cacheStorage) {
    try {
      const keys = await cacheStorage.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(RUNTIME_CACHE_PREFIX))
        .map((key) => cacheStorage.delete(key)));
    } catch {
      // Safari private mode and older native runtimes may deny Cache Storage.
    }
  }

  const storage = getStorage();
  if (storage) {
    try {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => Boolean(key));
      keys.filter((key) => key.startsWith(OFFLINE_STORAGE_PREFIX)).forEach((key) => storage.removeItem(key));
    } catch {
      // Ignore restricted localStorage; the service-worker message still runs.
    }
  }

  try { getController()?.postMessage({ type: 'CLEAR_RUNTIME_CACHE' }); } catch {
    // The next service-worker activation will remove stale runtime caches.
  }
}

export const offlineCachePrefixes = {
  runtime: RUNTIME_CACHE_PREFIX,
  storage: OFFLINE_STORAGE_PREFIX,
} as const;
