import type { ItineraryItem } from './itinerary';
import type { Voucher } from './vouchers';
export function travelStops(items: readonly ItineraryItem[], tripId: string, day: number) {
  return items.filter((item) => item?.trip_id === tripId && item.day_number === day && !item.is_backup).slice().sort((a, b) => a.position - b.position);
}
export function moveTravelCursor(stops: readonly ItineraryItem[], id: string | null, direction: -1 | 1) {
  if (!stops.length) return null;
  const current = Math.max(0, stops.findIndex((item) => item.id === id));
  return stops[Math.max(0, Math.min(stops.length - 1, current + direction))].id;
}
export function stationVouchers(vouchers: readonly Voucher[], tripId: string, itemId: string) {
  return vouchers.filter((v) => v?.trip_id === tripId && v.item_id === itemId);
}
