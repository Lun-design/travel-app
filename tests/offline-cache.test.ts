import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clearOfflineCache } from '../lib/offline-cache';
import { createMemoryOfflineStore, offlineStore } from '../lib/offline-store';
import { getInitialOfflineState, subscribeToNetworkStatus } from '../lib/offline-network';

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

  it('tracks online and offline transitions and removes the listener on cleanup', () => {
    const listeners = new Map<string, () => void>();
    const environment = {
      navigator: { onLine: true },
      addEventListener: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
      removeEventListener: vi.fn((event: string, listener: () => void) => {
        if (listeners.get(event) === listener) listeners.delete(event);
      }),
    };
    const changes: boolean[] = [];

    expect(getInitialOfflineState(environment)).toBe(false);
    const unsubscribe = subscribeToNetworkStatus((offline) => changes.push(offline), environment);
    environment.navigator.onLine = false;
    listeners.get('offline')?.();
    environment.navigator.onLine = true;
    listeners.get('online')?.();

    expect(changes).toEqual([true, false]);
    unsubscribe();
    expect(environment.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it('persists trip places including address, coordinates and notes in the offline snapshot', async () => {
    const store = createMemoryOfflineStore();
    const scope = { userId: 'user-1', tripId: 'trip-1' };
    await store.putSnapshot(scope, {
      trip: null,
      members: [],
      itineraryItems: [],
      packingItems: [],
      expenses: [],
      vouchers: [],
      tripPlaces: [{ id: 'place-1', title: '清水寺', address: '京都市東山區', lat: 34.9948, lng: 135.785, notes: '早上入場' }],
      savedAt: new Date().toISOString(),
    });

    await expect(store.getSnapshot(scope)).resolves.toMatchObject({
      tripPlaces: [expect.objectContaining({ title: '清水寺', address: '京都市東山區', lat: 34.9948, lng: 135.785, notes: '早上入場' })],
    });
  });

  it('defines network-first dynamic caching for scoped itinerary APIs and the offline banner contract', () => {
    const serviceWorker = readFileSync(path.resolve(process.cwd(), 'public', 'sw.js'), 'utf8');
    const banner = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'OfflineBanner.tsx'), 'utf8');
    const networkHelper = readFileSync(path.resolve(process.cwd(), 'lib', 'offline-network.ts'), 'utf8');

    expect(serviceWorker).toContain('isTripDataResource');
    expect(serviceWorker).toContain('networkFirst');
    expect(serviceWorker).toContain('trip_places');
    expect(serviceWorker).toContain('cache.put(request');
    expect(serviceWorker).toContain('caches.match(request)');
    expect(networkHelper).toContain("addEventListener('online'");
    expect(networkHelper).toContain("addEventListener('offline'");
    expect(banner).toContain('目前使用快取資料，連線後將自動同步');
  });
});
