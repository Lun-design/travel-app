import { supabase } from './supabase';
import type { ItineraryItem } from './itinerary';
export type Trip = { id: string; title: string; destination: string; start_date: string; end_date: string; invite_code: string };
export async function listTrips() { const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: true }); if (error) throw error; return data as Trip[]; }
export async function listItineraryItems(tripId: string) { const { data, error } = await supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('day_number').order('time'); if (error) throw error; return data as ItineraryItem[]; }
export async function saveItineraryItem(item: Partial<ItineraryItem> & { trip_id: string; created_by: string }) { const query = item.id ? supabase.from('itinerary_items').update(item).eq('id', item.id).select().single() : supabase.from('itinerary_items').insert(item).select().single(); const { data, error } = await query; if (error) throw error; return data as ItineraryItem; }
export async function deleteItineraryItem(id: string) { const { error } = await supabase.from('itinerary_items').delete().eq('id', id); if (error) throw error; }
