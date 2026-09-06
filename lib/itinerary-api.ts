import { supabase } from './supabase';
import { normalizeItineraryItemPayload, type ItineraryItem, type ItineraryItemSaveInput } from './itinerary';
import { createLocalId, enqueueOfflineMutation, resolveOfflineScope, shouldQueueOffline, updateOfflineCollection, type OfflineApiOptions } from './offline-data';
import { offlineStore, type OfflineScope, type OfflineStore } from './offline-store';

export type { OfflineApiOptions } from './offline-data';

function isLocalId(value: string | undefined): boolean {
  return Boolean(value?.startsWith('offline-'));
}

function optimisticItineraryItem(payload: ItineraryItemSaveInput, existing: ItineraryItem | undefined, id: string): ItineraryItem {
  return {
    id,
    trip_id: payload.trip_id,
    day_number: Number(payload.day_number ?? existing?.day_number ?? 1),
    position: Number(payload.position ?? existing?.position ?? 0),
    time: payload.time ?? existing?.time ?? null,
    location_name: String(payload.location_name ?? existing?.location_name ?? ''),
    address: payload.address ?? existing?.address ?? null,
    latitude: payload.latitude ?? existing?.latitude ?? null,
    longitude: payload.longitude ?? existing?.longitude ?? null,
    notes: payload.notes ?? existing?.notes ?? null,
    category: String(payload.category ?? existing?.category ?? 'spot'),
    created_by: String(payload.created_by ?? existing?.created_by ?? ''),
    duration_minutes: payload.duration_minutes ?? existing?.duration_minutes ?? null,
    difficulty: payload.difficulty ?? existing?.difficulty ?? null,
    opening_hours: payload.opening_hours ?? existing?.opening_hours ?? null,
  };
}

export async function listItineraryItems(tripId: string, options: OfflineApiOptions = {}): Promise<ItineraryItem[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(tripId, options.offlineScope);
  try {
    const { data, error } = await supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('day_number').order('position');
    if (error) throw error;
    const items = (data ?? []) as ItineraryItem[];
    await updateOfflineCollection(store, scope, 'itineraryItems', () => items);
    return items;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) return ((await store.getSnapshot(scope))?.itineraryItems ?? []) as ItineraryItem[];
    throw error;
  }
}

export async function updateItineraryItemsOrder(items: { id: string; position: number }[], options: OfflineApiOptions = {}): Promise<void> {
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  const store = options.store ?? offlineStore;
  try {
    const results = await Promise.all(items.map(({ id, position }) => supabase.from('itinerary_items').update({ position }).eq('id', id)));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => current.map((item) => {
      const next = items.find((entry) => entry.id === item.id);
      return next ? { ...item, position: next.position } : item;
    }));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      await enqueueOfflineMutation(store, { scope, entity: 'itinerary', operation: 'reorder', resourceId: items.map((item) => item.id).sort().join(','), payload: items });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => current.map((item) => {
        const next = items.find((entry) => entry.id === item.id);
        return next ? { ...item, position: next.position } : item;
      }));
      return;
    }
    throw error;
  }
}

export async function saveItineraryItem(item: ItineraryItemSaveInput, options: OfflineApiOptions = {}): Promise<ItineraryItem> {
  const payload = normalizeItineraryItemPayload(item);
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(payload.trip_id, options.offlineScope);
  try {
    const persistedId = isLocalId(payload.id) ? undefined : payload.id;
    const query = persistedId
      ? supabase.from('itinerary_items').update(payload).eq('id', persistedId).select().single()
      : supabase.from('itinerary_items').insert({ ...payload, id: undefined }).select().single();
    const { data, error } = await query;
    if (error) throw error;
    const saved = data as ItineraryItem;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [...current, saved]);
    return saved;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      const current = await store.getSnapshot(scope);
      const localId = payload.id ?? createLocalId('offline-item');
      const optimistic = optimisticItineraryItem(payload, (current?.itineraryItems as ItineraryItem[] | undefined)?.find((entry) => entry.id === localId), localId);
      const localOnly = isLocalId(payload.id);
      const queuedPayload = localOnly || !payload.id ? { ...payload, id: undefined } : payload;
      await enqueueOfflineMutation(store, { scope, entity: 'itinerary', operation: localOnly || !payload.id ? 'create' : 'update', resourceId: localId, payload: queuedPayload });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (items) => items.some((entry) => entry.id === localId) ? items.map((entry) => entry.id === localId ? optimistic : entry) : [...items, optimistic]);
      return optimistic;
    }
    throw error;
  }
}

export async function deleteItineraryItem(id: string, options: OfflineApiOptions = {}): Promise<void> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  try {
    const { error } = await supabase.from('itinerary_items').delete().eq('id', id);
    if (error) throw error;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (items) => items.filter((item) => item.id !== id));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      await enqueueOfflineMutation(store, { scope, entity: 'itinerary', operation: 'delete', resourceId: id, payload: {} });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (items) => items.filter((item) => item.id !== id));
      return;
    }
    throw error;
  }
}
