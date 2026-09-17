import type { ImportedItineraryPayload } from './itinerary-import';
import { filterNoiseItems } from './itinerary-import';
import type { ItineraryItem } from './itinerary';
import type { Trip } from './trips';

export type ImportMode = 'merge' | 'overwrite';
export type ImportPlace = { title: string; displayName: string; latitude: number; longitude: number };
export type ImportSearch = (query: string) => Promise<ImportPlace[]>;
export type ImportRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type ImportWriteResult = { items: ItineraryItem[]; trip?: Trip; saved: number; skipped: number; removed: number; unresolved: string[] };

/** Last line of defence: transition-only text never reaches the database. */
export function sanitizeImportItems(items: readonly ImportedItineraryPayload[]) {
  return filterNoiseItems(items);
}

function coordinates(item: { latitude: number | null; longitude: number | null }) {
  return typeof item.latitude === 'number' && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180;
}

/** Enrich named places only. Unknown locations stay visible for manual correction. */
export async function enrichImportedItems(items: ImportedItineraryPayload[], destination: string, search: ImportSearch) {
  const cache = new Map<string, Promise<ImportPlace[]>>();
  const unresolved: string[] = [];
  const output: ImportedItineraryPayload[] = [];
  for (const item of items) {
    if (coordinates(item)) { output.push({ ...item }); continue; }
    const name = item.address || item.location_name.replace(/(?:租和服|歸還和服|逛街|散步|互拍).*$/, '').trim();
    if (/^(?:早餐|午餐|晚餐|退房|入住飯店|飯店|休息|起飛|搭機航廈)/.test(name)) {
      unresolved.push(item.location_name); output.push({ ...item }); continue;
    }
    const query = `${destination.trim()} ${name}`.trim();
    try {
      if (!cache.has(query)) cache.set(query, search(query));
      const candidates = await cache.get(query)!;
      const normalized = (text: string) => text.toLowerCase().replace(/[\s\p{P}]/gu, '');
      const match = candidates.find(p => coordinates(p) && (normalized(p.title).includes(normalized(name)) || normalized(name).includes(normalized(p.title)) || (item.address && normalized(p.displayName).includes(normalized(item.address)))));
      if (match && match.title.trim()) {
        output.push({ ...item, address: item.address || match.displayName, latitude: match.latitude, longitude: match.longitude });
        continue;
      }
    } catch { /* A failed lookup must not manufacture a map marker. */ }
    unresolved.push(item.location_name);
    output.push({ ...item, latitude: null, longitude: null });
  }
  return { items: output, unresolved: [...new Set(unresolved)] };
}

async function write(tripId: string, mode: ImportMode | 'clear', items: ImportedItineraryPayload[], dayCount: number, rpc: ImportRpc): Promise<ImportWriteResult> {
  if (!tripId.trim()) throw new Error('找不到目標行程。');
  const { data, error } = await rpc('import_itinerary_items', { p_trip_id: tripId, p_mode: mode, p_items: items, p_day_count: dayCount });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || !Array.isArray((data as ImportWriteResult).items)) throw new Error('匯入回應不完整，請重新載入行程確認。');
  return { ...(data as ImportWriteResult), unresolved: [] };
}

export async function runItineraryImport(input: { tripId: string; mode: ImportMode; items: ImportedItineraryPayload[]; destination: string; dayCount: number }, deps: { search: ImportSearch; rpc: ImportRpc }) {
  const cleanItems = sanitizeImportItems(input.items);
  if (!cleanItems.length || cleanItems.some(item => !item.location_name.trim())) throw new Error('沒有可匯入的景點，既有行程未變更。');
  if (cleanItems.some(item => !Number.isInteger(item.day_number) || item.day_number < 1)) throw new Error('匯入資料包含無效的天數。');
  const enriched = await enrichImportedItems(cleanItems, input.destination, deps.search);
  const result = await write(input.tripId, input.mode, enriched.items, input.dayCount, deps.rpc);
  return { ...result, unresolved: enriched.unresolved };
}

export function clearImportedItinerary(tripId: string, rpc: ImportRpc) {
  return write(tripId, 'clear', [], 0, rpc);
}
