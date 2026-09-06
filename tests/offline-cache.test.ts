import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineCache } from '../lib/offline-cache';
import { offlineStore } from '../lib/offline-store';

describe('offline cache cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const storage = new Map<string, string>([
      ['travel-planner-offline:trip-1', 'private'],
      ['travel-planner.theme-mode', 'dark'],
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() { return storage.size; },
        key: (index: number) => [...storage.keys()][index] ?? null,
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => { storage.delete(key); },
        setItem: (key: string, value: string) => { storage.set(key, value); },
        clear: () => storage.clear(),
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn(async () => ['travel-planner-static-v1', 'travel-planner-runtime-v1', 'other-cache']),
        delete: vi.fn(async () => true),
      },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { serviceWorker: { controller: { postMessage: vi.fn() } } },
    });
  });

  it('removes runtime caches and private local data but keeps theme preference', async () => {
    const clearStore = vi.spyOn(offlineStore, 'clearAll').mockResolvedValue(undefined);
    await clearOfflineCache();

    expect(globalThis.caches.delete).toHaveBeenCalledWith('travel-planner-runtime-v1');
    expect(globalThis.caches.delete).not.toHaveBeenCalledWith('travel-planner-static-v1');
    expect(globalThis.localStorage.getItem('travel-planner-offline:trip-1')).toBeNull();
    expect(globalThis.localStorage.getItem('travel-planner.theme-mode')).toBe('dark');
    expect(globalThis.navigator.serviceWorker.controller!.postMessage).toHaveBeenCalledWith({ type: 'CLEAR_RUNTIME_CACHE' });
    expect(clearStore).toHaveBeenCalledTimes(1);
  });
});
