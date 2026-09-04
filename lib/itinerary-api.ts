import { supabase } from './supabase';
import { normalizeItineraryItemPayload, type ItineraryItem, type ItineraryItemSaveInput } from './itinerary';

export async function listItineraryItems(tripId: string): Promise<ItineraryItem[]> {
  const { data, error } = await supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('day_number').order('position');
  if (error) throw error;
  return (data ?? []) as ItineraryItem[];
}

export async function updateItineraryItemsOrder(items: { id: string; position: number }[]): Promise<void> {
  const results = await Promise.all(items.map(({ id, position }) => supabase.from('itinerary_items').update({ position }).eq('id', id)));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function saveItineraryItem(item: ItineraryItemSaveInput): Promise<ItineraryItem> {
  const payload = normalizeItineraryItemPayload(item);
  const query = payload.id
    ? supabase.from('itinerary_items').update(payload).eq('id', payload.id).select().single()
    : supabase.from('itinerary_items').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data as ItineraryItem;
}

export async function deleteItineraryItem(id: string): Promise<void> {
  const { error } = await supabase.from('itinerary_items').delete().eq('id', id);
  if (error) throw error;
}
