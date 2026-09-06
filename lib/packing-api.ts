import { supabase } from './supabase';
import type { PackingTemplate } from './packing-utils';
import { templateItems } from './packing-utils';
import { createLocalId, enqueueOfflineMutation, resolveOfflineScope, shouldQueueOffline, updateOfflineCollection, type OfflineApiOptions } from './offline-data';
import { offlineStore } from './offline-store';

export type PackingItem = { id: string; trip_id: string; category: string; name: string; item_name?: string; is_checked: boolean; is_packed?: boolean; assigned_to: string | null; created_at: string };

export function normalizePackingItem(row: any): PackingItem {
  return { ...row, name: row.item_name || row.name, item_name: row.item_name || row.name, is_checked: row.is_packed ?? row.is_checked ?? false, is_packed: row.is_packed ?? row.is_checked ?? false } as PackingItem;
}

function optimisticPackingItem(item: Pick<PackingItem, 'trip_id' | 'category' | 'name'> & Partial<Pick<PackingItem, 'assigned_to'>>, id: string): PackingItem {
  return { id, trip_id: item.trip_id, category: item.category, name: item.name, item_name: item.name, is_checked: false, is_packed: false, assigned_to: item.assigned_to ?? null, created_at: new Date().toISOString() };
}

export async function listPackingItems(tripId: string, options: OfflineApiOptions = {}): Promise<PackingItem[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(tripId, options.offlineScope);
  try {
    const { data, error } = await supabase.from('packing_items').select('*').eq('trip_id', tripId).order('category').order('created_at');
    if (error) throw error;
    const items = (data ?? []).map(normalizePackingItem);
    if (store) await updateOfflineCollection(store, scope, 'packingItems', () => items);
    return items;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) return ((await store?.getSnapshot(scope))?.packingItems ?? []) as PackingItem[];
    throw error;
  }
}

export async function createPackingItem(item: Pick<PackingItem, 'trip_id' | 'category' | 'name'> & Partial<Pick<PackingItem, 'assigned_to'>>, options: OfflineApiOptions = {}): Promise<PackingItem> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(item.trip_id, options.offlineScope);
  try {
    const { data, error } = await supabase.from('packing_items').insert({ trip_id: item.trip_id, category: item.category, name: item.name, item_name: item.name, is_checked: false, is_packed: false, assigned_to: item.assigned_to ?? null }).select().single();
    if (error) throw error;
    const saved = normalizePackingItem(data);
    if (store) await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => [...items, saved]);
    return saved;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      const local = optimisticPackingItem(item, createLocalId('offline-packing'));
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'packing', operation: 'create', resourceId: local.id, payload: { ...item } });
        await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => [...items, local]);
      }
      return local;
    }
    throw error;
  }
}

export async function updatePackingItem(id: string, patch: Partial<Pick<PackingItem, 'name' | 'item_name' | 'category' | 'is_checked' | 'is_packed' | 'assigned_to'>>, options: OfflineApiOptions = {}): Promise<void> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined || patch.item_name !== undefined) { const name = patch.item_name ?? patch.name; payload.name = name; payload.item_name = name; }
  if (patch.is_checked !== undefined || patch.is_packed !== undefined) { const packed = patch.is_packed ?? patch.is_checked; payload.is_checked = packed; payload.is_packed = packed; }
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.assigned_to !== undefined) payload.assigned_to = patch.assigned_to;
  try {
    const { error } = await supabase.from('packing_items').update(payload).eq('id', id);
    if (error) throw error;
    if (store) await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => items.map((item) => item.id === id ? normalizePackingItem({ ...item, ...payload }) : item));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'packing', operation: 'update', resourceId: id, payload });
        await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => items.map((item) => item.id === id ? normalizePackingItem({ ...item, ...payload }) : item));
      }
      return;
    }
    throw error;
  }
}

export async function deletePackingItem(id: string, options: OfflineApiOptions = {}): Promise<void> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  try {
    const { error } = await supabase.from('packing_items').delete().eq('id', id);
    if (error) throw error;
    if (store) await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => items.filter((item) => item.id !== id));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'packing', operation: 'delete', resourceId: id, payload: {} });
        await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => items.filter((item) => item.id !== id));
      }
      return;
    }
    throw error;
  }
}

export async function importPackingTemplate(tripId: string, template: PackingTemplate, options: OfflineApiOptions = {}): Promise<void> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(tripId, options.offlineScope);
  const sourceItems = templateItems(template);
  try {
    const { error } = await supabase.from('packing_items').insert(sourceItems.map((item) => ({ ...item, item_name: item.name, is_packed: item.is_checked, trip_id: tripId })));
    if (error) throw error;
    if (store) await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => [...items, ...sourceItems.map((item) => normalizePackingItem({ ...item, id: createLocalId('offline-template'), trip_id: tripId, created_at: new Date().toISOString() }))]);
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'packing', operation: 'create', resourceId: `template:${template}`, payload: { tripId, template } });
        await updateOfflineCollection<PackingItem>(store, scope, 'packingItems', (items) => [...items, ...sourceItems.map((item) => normalizePackingItem({ ...item, id: createLocalId('offline-template'), trip_id: tripId, created_at: new Date().toISOString() }))]);
      }
      return;
    }
    throw error;
  }
}
