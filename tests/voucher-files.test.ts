import { describe, expect, it, vi } from 'vitest';
import { getVoucherFileKey, loadVoucherFile, saveVoucherOffline, copyVoucherReference, VOUCHER_FILE_CACHE, type VoucherFileStore } from '../lib/voucher-files';
import type { Voucher } from '../lib/vouchers';
const voucher = { id: 'ticket', trip_id: 'trip', file_path: 'trip/u/ticket.pdf', file_type: 'pdf' } as Voucher;
const scope = { userId: 'u', tripId: 'trip' };
function memoryStore(): VoucherFileStore {
  const blobs = new Map<string, Blob>();
  return { read: async (key) => blobs.get(key) ?? null, write: async (key, blob) => { blobs.set(key, blob); } };
}
describe('private offline ticket files', () => {
  it('copies the reservation number and reports a rejected clipboard write', async () => {
    const writer = vi.fn(async () => undefined);
    await copyVoucherReference(' ABC123 ', writer);
    expect(writer).toHaveBeenCalledWith('ABC123');
    await expect(copyVoucherReference('ABC123', async () => { throw new Error('clipboard denied'); })).rejects.toThrow('clipboard denied');
  });
  it('clears the private ticket cache at logout while retaining static app assets', async () => {
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => [VOUCHER_FILE_CACHE, 'travel-planner-v7-static-current'], delete: remove });
    try {
      const { clearOfflineCache } = await import('../lib/offline-cache');
      await clearOfflineCache();
      expect(remove).toHaveBeenCalledWith(VOUCHER_FILE_CACHE);
      expect(remove).not.toHaveBeenCalledWith('travel-planner-v7-static-current');
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not store a canceled download', async () => {
    const store = memoryStore();
    const controller = new AbortController();
    controller.abort();
    await expect(saveVoucherOffline(voucher, scope, { store, signal: controller.signal, getRemoteUrl: async () => 'https://signed.example/file', fetcher: vi.fn(async () => new Response(new Blob(['pdf'], { type: 'application/pdf' }))) })).rejects.toThrow();
    expect(await store.read(getVoucherFileKey(voucher, scope))).toBeNull();
  });
  it('keys files by account, trip, ticket and file version', () => {
    expect(getVoucherFileKey(voucher, scope)).not.toBe(getVoucherFileKey(voucher, { ...scope, userId: 'other' }));
    expect(getVoucherFileKey(voucher, scope)).not.toBe(getVoucherFileKey({ ...voucher, file_path: 'new.pdf' }, scope));
    expect(() => getVoucherFileKey(voucher, { ...scope, tripId: 'other' })).toThrow();
    expect(() => getVoucherFileKey(voucher, { ...scope, userId: 'anonymous' })).toThrow();
  });
  it('downloads once, then opens the cached file offline without requesting a signed URL', async () => {
    const store = memoryStore();
    const getRemoteUrl = vi.fn(async () => 'https://signed.example/file?token=short-lived');
    const fetcher = vi.fn(async () => new Response(new Blob(['%PDF-1.7 ticket'], { type: 'application/pdf' })));
    await saveVoucherOffline(voucher, scope, { store, getRemoteUrl, fetcher });
    expect(fetcher).toHaveBeenCalledOnce();
    getRemoteUrl.mockClear();
    const file = await loadVoucherFile(voucher, scope, { store, getRemoteUrl, isOffline: true });
    expect(file.offlineReady).toBe(true);
    expect(file.url).toMatch(/^blob:/);
    expect(getRemoteUrl).not.toHaveBeenCalled();
    file.release();
  });
  it('does not leak another account file or make network requests on an offline cache miss', async () => {
    const store = memoryStore();
    await store.write(getVoucherFileKey(voucher, scope), new Blob(['ticket'], { type: 'application/pdf' }));
    const getRemoteUrl = vi.fn();
    await expect(loadVoucherFile(voucher, { ...scope, userId: 'other' }, { store, getRemoteUrl, isOffline: true })).rejects.toThrow(/離線/);
    expect(getRemoteUrl).not.toHaveBeenCalled();
  });
  it('never marks failed HTTP downloads or quota failures as saved', async () => {
    const store = memoryStore();
    const getRemoteUrl = async () => 'https://signed.example/file';
    await expect(saveVoucherOffline(voucher, scope, { store, getRemoteUrl, fetcher: vi.fn(async () => new Response('error', { status: 403 })) })).rejects.toThrow();
    expect(await store.read(getVoucherFileKey(voucher, scope))).toBeNull();
    const unavailable = { ...store, write: async () => { throw new Error('QuotaExceededError'); } };
    await expect(saveVoucherOffline(voucher, scope, { store: unavailable, getRemoteUrl, fetcher: vi.fn(async () => new Response(new Blob(['pdf'], { type: 'application/pdf' }))) })).rejects.toThrow('QuotaExceededError');
  });
});
