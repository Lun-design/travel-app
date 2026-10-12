import type { Voucher } from './vouchers';
import type { OfflineScope } from './offline-store';
import { validateVoucherUploadSize } from './vouchers';
export type VoucherFileStore = { read: (key: string) => Promise<Blob | null>; write: (key: string, blob: Blob) => Promise<void> };
type FileOptions = { store: VoucherFileStore; getRemoteUrl: () => Promise<string>; isOffline?: boolean; fetcher?: typeof fetch; signal?: AbortSignal };
// Existing logout cleanup removes every cache with this prefix.
export const VOUCHER_FILE_CACHE = 'travel-planner-runtime-voucher-files-v1';
export function getVoucherFileKey(voucher: Pick<Voucher, 'id' | 'trip_id' | 'file_path'>, scope: OfflineScope): string {
  if (!scope.userId?.trim() || scope.userId === 'anonymous' || voucher.trip_id !== scope.tripId || !voucher.id || !voucher.file_path) throw new Error('無法確認票券所屬帳號與行程。');
  return `https://offline.travel-planner.invalid/vouchers/${[scope.userId, scope.tripId, voucher.id, voucher.file_path].map(encodeURIComponent).join('/')}`;
}
export function canStoreVoucherOffline(): boolean {
  return typeof caches !== 'undefined' && typeof URL.createObjectURL === 'function';
}
export function createBrowserVoucherFileStore(): VoucherFileStore {
  return {
    async read(key) {
      if (!canStoreVoucherOffline()) return null;
      const response = await (await caches.open(VOUCHER_FILE_CACHE)).match(key);
      return response ? response.blob() : null;
    },
    async write(key, blob) {
      if (!canStoreVoucherOffline()) throw new Error('此裝置無法儲存離線票券，請下載檔案到裝置備用。');
      await (await caches.open(VOUCHER_FILE_CACHE)).put(key, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    },
  };
}
export async function loadVoucherFile(voucher: Voucher, scope: OfflineScope, options: FileOptions): Promise<{ url: string; offlineReady: boolean; release: () => void }> {
  const key = getVoucherFileKey(voucher, scope);
  const blob = await options.store.read(key).catch(() => null);
  if (blob && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    return { url, offlineReady: true, release: () => URL.revokeObjectURL(url) };
  }
  if (options.isOffline) throw new Error('此票券尚未儲存離線備用，請連線後先儲存。');
  return { url: await options.getRemoteUrl(), offlineReady: false, release: () => {} };
}
export async function saveVoucherOffline(voucher: Voucher, scope: OfflineScope, options: FileOptions): Promise<void> {
  const key = getVoucherFileKey(voucher, scope);
  if (options.isOffline) throw new Error('請連線後再儲存離線票券。');
  const url = await options.getRemoteUrl();
  const response = await (options.fetcher ?? fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error(`票券下載失敗（${response.status}），請重試。`);
  const blob = await response.blob();
  validateVoucherUploadSize(blob.size);
  const mime = blob.type.split(';')[0].toLowerCase();
  if (voucher.file_type === 'pdf' ? mime !== 'application/pdf' : !/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error('下載內容不是正確的票券檔案，無法儲存離線備用。');
  options.signal?.throwIfAborted();
  await options.store.write(key, blob);
}

export async function copyVoucherReference(value: string, writer?: (value: string) => Promise<void>) {
  const reference = value.trim();
  if (!reference) throw new Error('未提供預約編號。');
  if (writer) return writer(reference);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return navigator.clipboard.writeText(reference);
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const textarea = document.createElement('textarea');
    textarea.value = reference;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try { textarea.select(); if (document.execCommand('copy')) return; }
    finally { textarea.remove(); }
  }
  throw new Error('此裝置無法一鍵複製，請長按預約編號複製。');
}
