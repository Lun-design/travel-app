import type { ItineraryItem } from './itinerary';
import type { Expense } from './expenses-api';
import type { TripPlace } from './trip-places-api';
import type { Voucher } from './vouchers';
export type TripSearchKind = 'item' | 'voucher' | 'expense' | 'place';
export type TripSearchResult = { kind: TripSearchKind; id: string; title: string; subtitle: string; dayNumber?: number };
export type TripSearchData = { tripId: string; items: ItineraryItem[]; vouchers: Voucher[]; expenses: Expense[]; places: TripPlace[] };
export type TripSearchDestination = { tab: 'timeline'; id: string; day: number; previewBackup?: boolean } | { tab: 'documents'; voucher: Voucher } | { tab: 'expenses' | 'places'; id: string };
export function getTripSearchDestination(data: TripSearchData, result: TripSearchResult): TripSearchDestination | null {
  const matches = (row: { id: string; trip_id: string }) => row?.id === result.id && row.trip_id === data.tripId;
  if (result.kind === 'item') {
    const item = data.items.find(matches);
    return item && Number.isInteger(item.day_number) && item.day_number > 0 ? { tab: 'timeline', id: item.id, day: item.day_number, ...(item.is_backup ? { previewBackup: true } : {}) } : null;
  }
  if (result.kind === 'voucher') {
    const voucher = data.vouchers.find(matches);
    return voucher ? { tab: 'documents', voucher } : null;
  }
  if (result.kind === 'expense') return data.expenses.some(matches) ? { tab: 'expenses', id: result.id } : null;
  return data.places.some((place) => matches(place) && place.status !== 'scheduled') ? { tab: 'places', id: result.id } : null;
}
const clean = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export const TRIP_SEARCH_LABELS: Record<TripSearchKind, string> = { item: '景點', voucher: '票券', expense: '旅費', place: '靈感' };

/** Search only already-loaded trip data; no regexes, requests or HTML output. */
export function searchTripData(data: TripSearchData, query: string, kind?: TripSearchKind): TripSearchResult[] {
  const terms = clean(query).slice(0, 200).split(/\s+/).filter(Boolean);
  if (!terms.length || !data.tripId) return [];
  const results: TripSearchResult[] = [];
  const seen = new Set<string>();
  const add = (row: { id: string; trip_id: string }, type: TripSearchKind, title: string, subtitle: string, fields: unknown[], dayNumber?: number) => {
    if (row.trip_id !== data.tripId || !row.id || (kind && type !== kind)) return;
    const key = `${type}:${row.id}`;
    const content = clean([title, subtitle, ...fields.map(text)].join(' '));
    if (seen.has(key) || !terms.every((term) => content.includes(term))) return;
    seen.add(key);
    results.push({ kind: type, id: row.id, title, subtitle, ...(Number.isInteger(dayNumber) && Number(dayNumber) > 0 ? { dayNumber } : {}) });
  };
  const items = (data.items ?? []).filter((item) => item && item.trip_id === data.tripId);
  for (const item of items) add(item, 'item', text(item.location_name) || '未命名景點', `Day ${item.day_number} · ${item.time || '未排定時間'}${item.address ? ` · ${item.address}` : ''}`, [item.notes, item.category], item.day_number);
  for (const voucher of data.vouchers ?? []) {
    if (!voucher) continue;
    const linked = items.find((item) => item.id === voucher.item_id);
    add(voucher, 'voucher', text(voucher.title) || '未命名票券', [voucher.reservation_number, voucher.usage_at, linked?.location_name].filter(Boolean).join(' · '), [voucher.notes, linked?.address], linked?.day_number);
  }
  for (const expense of data.expenses ?? []) {
    if (!expense) continue;
    add(expense, 'expense', text(expense.title) || '未命名旅費', `${expense.currency || ''} ${Number.isFinite(Number(expense.amount)) ? expense.amount : ''}`, [expense.category, ...(Array.isArray(expense.receipt_items) ? expense.receipt_items : []).map((item) => item?.name)]);
  }
  for (const place of data.places ?? []) {
    if (!place || place.status === 'scheduled') continue;
    add(place, 'place', text(place.title) || '未命名靈感', text(place.address), [place.notes, place.category]);
  }
  return results;
}
