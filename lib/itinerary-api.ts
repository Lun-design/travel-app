import { supabase } from './supabase';
import { normalizeItineraryItemPayload, type ItineraryItem, type ItineraryItemSaveInput } from './itinerary';
import { createLocalId, enqueueOfflineMutation, resolveOfflineScope, shouldQueueOffline, updateOfflineCollection, type OfflineApiOptions } from './offline-data';
import { offlineStore, type OfflineScope, type OfflineStore } from './offline-store';

export type { OfflineApiOptions } from './offline-data';

function isLocalId(value: string | undefined): boolean {
  return Boolean(value?.startsWith('offline-'));
}

/**
 * PostgREST rejects a request that mentions a column which is not present in
 * the remote schema cache. Optional editor fields therefore must stay omitted
 * when no value was provided, rather than being sent as an explicit null.
 */
export function buildItineraryWritePayload(item: ItineraryItemSaveInput): ItineraryItemSaveInput {
  const normalized = normalizeItineraryItemPayload(item);
  if (normalized.estimated_cost == null) {
    const { estimated_cost: _estimatedCost, ...withoutEstimatedCost } = normalized;
    return withoutEstimatedCost;
  }
  return normalized;
}

/** Detect the schema-cache error raised while estimated_cost is not migrated. */
export function isMissingEstimatedCostColumnError(error: unknown): boolean {
  const record = typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown; details?: unknown }
    : null;
  const code = typeof record?.code === 'string' ? record.code : '';
  const text = [
    error instanceof Error ? error.message : '',
    typeof record?.message === 'string' ? record.message : '',
    typeof record?.details === 'string' ? record.details : '',
  ].join(' ');
  return code === 'PGRST204' && /estimated_cost/i.test(text);
}

/** Convert PostgREST errors into a useful message for the reorder menu. */
export function describeItineraryOrderError(error: unknown): string {
  const record = typeof error === 'object' && error !== null
    ? error as { code?: unknown; message?: unknown }
    : null;
  const code = typeof record?.code === 'string' ? record.code : '';
  const message = error instanceof Error
    ? error.message
    : (typeof record?.message === 'string' ? record.message : '');
  const migrationMissing = code === '42883'
    || code === 'PGRST202'
    || (/update_itinerary_items_order/i.test(message) && /not find|does not exist|unavailable|missing/i.test(message));
  if (migrationMissing) {
    return '排序更新失敗：請先套用 Supabase migration 20260918000000_atomic_itinerary_order.sql。';
  }
  return message || '排序更新失敗，請稍後再試。';
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
    duration_minutes: 'duration_minutes' in payload ? payload.duration_minutes ?? null : existing?.duration_minutes ?? null,
    estimated_cost: payload.estimated_cost ?? existing?.estimated_cost ?? null,
    difficulty: payload.difficulty ?? existing?.difficulty ?? null,
    opening_hours: payload.opening_hours ?? existing?.opening_hours ?? null,
    preview_url: payload.preview_url ?? existing?.preview_url ?? null,
    photo_reference: payload.photo_reference ?? existing?.photo_reference ?? null,
    is_backup: payload.is_backup ?? existing?.is_backup ?? false,
    backup_for_id: payload.backup_for_id ?? existing?.backup_for_id ?? null,
    reservation_tags: payload.reservation_tags ?? existing?.reservation_tags ?? [],
    updated_at: new Date().toISOString(),
    updated_by: payload.created_by || existing?.updated_by || null,
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
    // Reordering is a single transaction in Supabase. This prevents the
    // intermediate positions produced by several independent PATCH calls from
    // leaking to collaborators or leaving a partially reordered day behind.
    // Keep the method call attached to `supabase`. SupabaseClient.rpc uses the
    // client instance internally; extracting it into a local variable loses
    // `this` in Web builds and makes every reorder fail before any request is
    // sent.
    const result = await supabase.rpc('update_itinerary_items_order', { p_items: items });
    if (result?.error) throw result.error;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => [...current.map((item) => {
      const next = items.find((entry) => entry.id === item.id);
      return next ? { ...item, position: next.position } : item;
    })].sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)));
  } catch (error) {
    console.error('[Itinerary] order RPC failed', { error, payload: items });
    if (!options.replaying && shouldQueueOffline(error)) {
      await enqueueOfflineMutation(store, { scope, entity: 'itinerary', operation: 'reorder', resourceId: items.map((item) => item.id).sort().join(','), payload: items });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => [...current.map((item) => {
        const next = items.find((entry) => entry.id === item.id);
        return next ? { ...item, position: next.position } : item;
      })].sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0)));
      return;
    }
    throw error;
  }
}

export type ItineraryScheduleChange = { id: string; time: string | null };

function normalizeScheduleChanges(items: ItineraryScheduleChange[]): ItineraryScheduleChange[] {
  return items.map((item) => ({
    id: String(item.id ?? '').trim(),
    time: typeof item.time === 'string' ? item.time.trim() || null : null,
  })).filter((item) => item.id.length > 0);
}

function applyScheduleChanges(items: ItineraryItem[], changes: ItineraryScheduleChange[]): ItineraryItem[] {
  const byId = new Map(changes.map((change) => [change.id, change.time]));
  return items.map((item) => byId.has(item.id) ? { ...item, time: byId.get(item.id) ?? null } : item);
}

/** Persist all shifted start times in one atomic Supabase RPC transaction. */
export async function updateItineraryItemsSchedule(items: ItineraryScheduleChange[], options: OfflineApiOptions = {}): Promise<void> {
  const changes = normalizeScheduleChanges(items);
  if (!changes.length) return;
  if (changes.length !== items.length) throw new Error('Invalid itinerary schedule payload');
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  const store = options.store ?? offlineStore;
  try {
    const result = await supabase.rpc('update_itinerary_items_schedule', { p_items: changes });
    if (result?.error) throw result.error;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => applyScheduleChanges(current, changes));
  } catch (error) {
    console.error('[Itinerary] schedule RPC failed', { error, payload: changes });
    if (!options.replaying && shouldQueueOffline(error)) {
      await enqueueOfflineMutation(store, {
        scope,
        entity: 'itinerary',
        operation: 'schedule',
        resourceId: changes.map((item) => item.id).sort().join(','),
        payload: changes,
      });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (current) => applyScheduleChanges(current, changes));
      return;
    }
    throw error;
  }
}

export async function saveItineraryItem(item: ItineraryItemSaveInput, options: OfflineApiOptions = {}): Promise<ItineraryItem> {
  const payload = buildItineraryWritePayload(item);
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(payload.trip_id, options.offlineScope);
  try {
    const persistedId = isLocalId(payload.id) ? undefined : payload.id;
    const persist = (writePayload: ItineraryItemSaveInput) => persistedId
      ? supabase.from('itinerary_items').update(writePayload).eq('id', persistedId).select().single()
      : supabase.from('itinerary_items').insert({ ...writePayload, id: undefined }).select().single();
    let result = await persist(payload);
    // Keep clients usable while a migration is rolling out. Once the column is
    // applied, the first request succeeds and this path is never exercised.
    if (result.error && 'estimated_cost' in payload && isMissingEstimatedCostColumnError(result.error)) {
      const { estimated_cost: _estimatedCost, ...fallbackPayload } = payload;
      result = await persist(fallbackPayload);
    }
    const { data, error } = result;
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

/**
 * Persist a user-selected image URL without sending the rest of the item.
 * Keeping this as a narrow update prevents an image change from overwriting
 * concurrent edits to the itinerary item.
 */
export async function updateItineraryItemImage(
  id: string,
  previewUrl: string | null,
  options: OfflineApiOptions = {},
): Promise<void> {
  const normalizedUrl = typeof previewUrl === 'string' ? previewUrl.trim() || null : null;
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  try {
    const { error } = await supabase
      .from('itinerary_items')
      .update({ preview_url: normalizedUrl })
      .eq('id', id);
    if (error) throw error;
    await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (items) => items.map((item) => (
      item.id === id ? { ...item, preview_url: normalizedUrl } : item
    )));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      await enqueueOfflineMutation(store, {
        scope,
        entity: 'itinerary',
        operation: 'update',
        resourceId: id,
        payload: { id, preview_url: normalizedUrl },
      });
      await updateOfflineCollection<ItineraryItem>(store, scope, 'itineraryItems', (items) => items.map((item) => (
        item.id === id ? { ...item, preview_url: normalizedUrl } : item
      )));
      return;
    }
    throw error;
  }
}

/** Alias that makes the persisted column name explicit for API consumers. */
export const updateItineraryItemPreviewUrl = updateItineraryItemImage;
