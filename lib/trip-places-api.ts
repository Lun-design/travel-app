import { supabase } from './supabase';
import { saveItineraryItem } from './itinerary-api';
import type { ItineraryItem, ItineraryItemSaveInput } from './itinerary';

export type TripPlaceStatus = 'saved' | 'scheduled';

export type TripPlace = {
  id: string;
  trip_id: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  category: string;
  notes: string | null;
  status: TripPlaceStatus;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type CreateTripPlaceInput = Omit<TripPlace, 'id' | 'status' | 'created_at'> & {
  status?: TripPlaceStatus;
};

export type UpdateTripPlaceInput = Partial<Pick<TripPlace, 'title' | 'address' | 'lat' | 'lng' | 'category' | 'notes'>>;

export type ScheduleTripPlaceOptions = {
  dayNumber: number;
  startTime?: string | null;
  durationMinutes?: number | null;
  createdBy: string;
  position?: number;
};

export function normalizeTripPlace(row: unknown): TripPlace {
  const value = row as Partial<TripPlace>;
  const normalized: TripPlace = {
    id: String(value.id ?? ''),
    trip_id: String(value.trip_id ?? ''),
    title: String(value.title ?? '').trim(),
    address: value.address == null ? null : String(value.address),
    lat: value.lat == null || !Number.isFinite(Number(value.lat)) ? null : Number(value.lat),
    lng: value.lng == null || !Number.isFinite(Number(value.lng)) ? null : Number(value.lng),
    category: String(value.category ?? 'spot'),
    notes: value.notes == null ? null : String(value.notes),
    status: value.status === 'scheduled' ? 'scheduled' : 'saved',
    created_by: String(value.created_by ?? ''),
    created_at: String(value.created_at ?? ''),
  };
  if ('updated_at' in value) normalized.updated_at = value.updated_at == null ? null : String(value.updated_at);
  if ('updated_by' in value) normalized.updated_by = value.updated_by == null ? null : String(value.updated_by);
  return normalized;
}

export function buildItineraryItemFromPlace(place: TripPlace, options: ScheduleTripPlaceOptions): ItineraryItemSaveInput {
  return {
    trip_id: place.trip_id,
    day_number: Math.max(1, Math.trunc(options.dayNumber)),
    position: options.position ?? 0,
    time: options.startTime?.trim() || null,
    location_name: place.title,
    address: place.address,
    latitude: place.lat,
    longitude: place.lng,
    notes: place.notes,
    category: place.category || 'spot',
    duration_minutes: options.durationMinutes == null ? null : Math.max(1, Math.round(options.durationMinutes)),
    created_by: options.createdBy,
  };
}

export function buildScheduledPlacePatch(): Pick<TripPlace, 'status'> {
  return { status: 'scheduled' };
}

export async function listTripPlaces(tripId: string): Promise<TripPlace[]> {
  const { data, error } = await supabase
    .from('trip_places')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeTripPlace);
}

export async function createTripPlace(input: CreateTripPlaceInput): Promise<TripPlace> {
  const title = input.title.trim();
  if (!title) throw new Error('景點名稱不能為空');
  const payload = {
    trip_id: input.trip_id,
    title,
    address: input.address?.trim() || null,
    lat: input.lat == null || !Number.isFinite(input.lat) ? null : input.lat,
    lng: input.lng == null || !Number.isFinite(input.lng) ? null : input.lng,
    category: input.category || 'spot',
    notes: input.notes?.trim() || null,
    status: input.status ?? 'saved',
    created_by: input.created_by,
  };
  const { data, error } = await supabase.from('trip_places').insert(payload).select().single();
  if (error) throw error;
  return normalizeTripPlace(data);
}

export async function updateTripPlace(id: string, input: UpdateTripPlaceInput): Promise<TripPlace> {
  const title = input.title === undefined ? undefined : input.title.trim();
  if (title !== undefined && !title) throw new Error('景點名稱不能為空');
  const payload: UpdateTripPlaceInput = {
    ...(title === undefined ? {} : { title }),
    ...(input.address === undefined ? {} : { address: input.address?.trim() || null }),
    ...(input.lat === undefined ? {} : { lat: input.lat == null || !Number.isFinite(input.lat) ? null : input.lat }),
    ...(input.lng === undefined ? {} : { lng: input.lng == null || !Number.isFinite(input.lng) ? null : input.lng }),
    ...(input.category === undefined ? {} : { category: input.category.trim() || 'spot' }),
    ...(input.notes === undefined ? {} : { notes: input.notes?.trim() || null }),
  };
  const { data, error } = await supabase.from('trip_places').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return normalizeTripPlace(data);
}

export async function deleteTripPlace(id: string): Promise<void> {
  const { error } = await supabase.from('trip_places').delete().eq('id', id);
  if (error) throw error;
}

export async function markTripPlaceScheduled(id: string): Promise<TripPlace> {
  const { data, error } = await supabase.from('trip_places').update(buildScheduledPlacePatch()).eq('id', id).select().single();
  if (error) throw error;
  return normalizeTripPlace(data);
}

/** Persist an itinerary row first, then mark the source inspiration as scheduled. */
export async function scheduleTripPlace(id: string, options: ScheduleTripPlaceOptions): Promise<{ place: TripPlace; item: ItineraryItem }> {
  const { data, error } = await supabase.from('trip_places').select('*').eq('id', id).single();
  if (error) throw error;
  const place = normalizeTripPlace(data);
  const item = await saveItineraryItem(buildItineraryItemFromPlace(place, options));
  const scheduled = await markTripPlaceScheduled(place.id);
  return { place: scheduled, item };
}
