import { supabase } from './supabase';
import { searchNominatim } from './geocoding';
import { hasGooglePlacesApiKey, searchGooglePlacesText } from './google-places';
import { offlineStore } from './offline-store';
import { patchOfflineSnapshot } from './offline-data';
import { clearImportedItinerary, runItineraryImport, type ImportRpc, type ImportWriteResult } from './itinerary-import-service';

async function searchImportPlaces(query: string) {
  if (hasGooglePlacesApiKey()) {
    try {
      const places = await searchGooglePlacesText(query);
      if (places.length) return places;
    } catch { /* Use the existing alternative when Google is unavailable. */ }
  }
  return searchNominatim(query);
}

/** Atomic bulk actions are online-only: do not replay a destructive old snapshot. */
async function readyScope(tripId: string) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('匯入與清空需要網路連線，請連線後再試。');
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) throw new Error('請先登入。');
  const scope = { userId: data.session.user.id, tripId };
  const pending = await offlineStore.listMutations(scope);
  if (pending.some(m => m.entity === 'itinerary' || m.entity === 'trip')) throw new Error('此行程還有離線變更，請先完成同步後再匯入或清空。');
  return scope;
}

const rpc: ImportRpc = (name, args) => supabase.rpc(name, args);
async function purgeBeforeOverwrite(tripId: string) {
  const { error } = await supabase.from('itinerary_items').delete().eq('trip_id', tripId);
  if (error) throw new Error(error.message);
}
async function cacheResult(scope: Awaited<ReturnType<typeof readyScope>>, result: ImportWriteResult) {
  try {
    await patchOfflineSnapshot(offlineStore, scope, { itineraryItems: result.items, ...(result.trip ? { trip: result.trip } : {}) });
  } catch (error) { console.warn('[ItineraryImport] 已儲存，但本機快取更新失敗', error); }
  return result;
}

export async function importTripItems(input: Parameters<typeof runItineraryImport>[0]) {
  const scope = await readyScope(input.tripId);
  if (input.mode === 'overwrite') await purgeBeforeOverwrite(input.tripId);
  return cacheResult(scope, await runItineraryImport(input, { search: searchImportPlaces, rpc }));
}

export async function clearTripItems(tripId: string) {
  const scope = await readyScope(tripId);
  return cacheResult(scope, await clearImportedItinerary(tripId, rpc));
}
