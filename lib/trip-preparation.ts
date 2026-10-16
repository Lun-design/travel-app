import type { OfflineScope } from './offline-store';
import type { Voucher } from './vouchers';
import { getVoucherFileKey, type VoucherFileStore } from './voucher-files';

/** Only inspect this device's scoped files; never download or request signed URLs. */
export async function checkVoucherAvailability(vouchers: readonly Voucher[], scope: OfflineScope, store: VoucherFileStore) {
  const scoped = [...new Map(vouchers.filter((v) => v?.trip_id === scope.tripId && v.id).map((v) => [v.id, v])).values()];
  const results = await Promise.all(scoped.map(async (voucher) => {
    try {
      const key = getVoucherFileKey(voucher, scope);
      const saved = store.has ? await store.has(key) : Boolean(await store.read(key));
      return { id: voucher.id, saved, failed: false };
    } catch { return { id: voucher.id, saved: false, failed: true }; }
  }));
  return { total: scoped.length, missingIds: results.filter((r) => !r.saved && !r.failed).map((r) => r.id), unknown: results.some((r) => r.failed) };
}
