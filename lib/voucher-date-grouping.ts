export type DateVoucher = { id: string; usage_at?: string | null };
export type VoucherDateGroups<T extends DateVoucher> = { future: T[]; expired: T[]; undated: T[] };

export function groupVouchersByDate<T extends DateVoucher>(items: T[], now = new Date()): VoucherDateGroups<T> {
  const future: T[] = [];
  const expired: T[] = [];
  const undated: T[] = [];
  const nowTime = now.getTime();
  for (const item of items) {
    if (!item.usage_at) { undated.push(item); continue; }
    const time = new Date(item.usage_at).getTime();
    if (!Number.isFinite(time) || time < nowTime) expired.push(item);
    else future.push(item);
  }
  future.sort((a, b) => new Date(a.usage_at!).getTime() - new Date(b.usage_at!).getTime());
  expired.sort((a, b) => new Date(b.usage_at!).getTime() - new Date(a.usage_at!).getTime());
  return { future, expired, undated };
}
