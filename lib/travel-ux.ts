import type { Trip } from './trips';
import type { ItineraryItem } from './itinerary';
import type { Voucher } from './vouchers';
import type { RealtimeChange } from './realtime-collaboration';
import { tripDateForDay, tripDayNumberForDate } from './trip-dates';
import { toZonedDateTimeParts } from './timezone';

export function getTodayTripDay(trip: Pick<Trip, 'start_date' | 'end_date' | 'timezone'>, now = new Date()): number | null {
  if (!Number.isFinite(now.getTime())) return null;
  return tripDayNumberForDate(toZonedDateTimeParts(now, trip.timezone).date, trip.start_date, trip.end_date);
}
export function getDayVouchers(trip: Pick<Trip, 'start_date' | 'timezone'>, day: number, items: ItineraryItem[], vouchers: Voucher[]): Voucher[] {
  const target = tripDateForDay(trip.start_date, day);
  if (!target) return [];
  const ids = new Set(items.filter((item) => item.day_number === day).map((item) => item.id));
  const seen = new Set<string>();
  return vouchers.filter((voucher) => {
    if (!voucher?.id || seen.has(voucher.id)) return false;
    let matches = Boolean(voucher.item_id && ids.has(voucher.item_id));
    const usageAt = voucher.usage_at?.trim();
    if (usageAt) {
      const parsed = new Date(usageAt);
      if (!Number.isFinite(parsed.getTime())) return false;
      // Picker values without an offset describe the trip's local calendar.
      const date = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(usageAt) ? toZonedDateTimeParts(parsed, trip.timezone).date : usageAt.slice(0, 10);
      matches = date === target;
    }
    if (matches) seen.add(voucher.id);
    return matches;
  });
}
export function describeCollaborativeUpdate(change: RealtimeChange, name: string): string {
  const record = change.eventType === 'DELETE' ? change.oldRecord : change.record;
  const day = Number(record.day_number);
  const dayLabel = Number.isInteger(day) && day > 0 ? `Day ${day} ` : '';
  const labels = { itinerary_items: '行程', trip_places: '靈感收藏', expenses: '旅費', packing_items: '打包清單', vouchers: '票券', trip_info_pins: '住宿／集合資訊' };
  const title = typeof record.location_name === 'string' ? record.location_name.slice(0, 60) : '';
  const verb = change.eventType === 'DELETE' ? '刪除了' : change.eventType === 'INSERT' ? '新增了' : '更新了';
  return `${name.trim() || '旅伴'}${verb} ${dayLabel}${title || labels[change.table]}`;
}
