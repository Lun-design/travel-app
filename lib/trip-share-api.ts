import { supabase } from './supabase';
import type { ItineraryItem } from './itinerary';
import type { Trip } from './trips';

export type TripShare = {
  id: string;
  trip_id: string;
  share_token: string;
  is_active: boolean;
  include_expenses: boolean;
  created_by: string;
  created_at: string;
};

export type PublicTripSummary = Pick<Trip, 'id' | 'title' | 'destination' | 'start_date' | 'end_date' | 'default_departure_time' | 'timezone'>;
export type PublicExpense = { id: string; title: string; amount: number; currency: string; category: string | null };
export type PublicTripPayload = {
  share: Pick<TripShare, 'id' | 'trip_id' | 'share_token' | 'is_active' | 'include_expenses'>;
  trip: PublicTripSummary;
  items: ItineraryItem[];
  expenses: PublicExpense[];
};

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** Generates an opaque URL-safe token. The random source is injectable for deterministic tests. */
export function createShareToken(random: () => number = Math.random, length = 32): string {
  return Array.from({ length }, () => TOKEN_ALPHABET[Math.min(TOKEN_ALPHABET.length - 1, Math.max(0, Math.floor(random() * TOKEN_ALPHABET.length)))])
    .join('');
}

export function buildTripShareUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/share/${encodeURIComponent(token)}`;
}

function normalizeItem(raw: Partial<ItineraryItem>, index: number, tripId: string): ItineraryItem {
  return {
    id: String(raw.id ?? `public-item-${index}`),
    trip_id: String(raw.trip_id ?? tripId),
    day_number: Number(raw.day_number ?? 1),
    position: Number(raw.position ?? index),
    time: raw.time ?? null,
    location_name: String(raw.location_name ?? ''),
    address: raw.address ?? null,
    latitude: raw.latitude == null ? null : Number(raw.latitude),
    longitude: raw.longitude == null ? null : Number(raw.longitude),
    notes: raw.notes ?? null,
    category: String(raw.category ?? 'spot'),
    created_by: '',
    duration_minutes: raw.duration_minutes == null ? null : Number(raw.duration_minutes),
    difficulty: raw.difficulty ?? null,
    opening_hours: raw.opening_hours ?? null,
  };
}

/** Converts the RPC response into a read-only, least-privilege view model. */
export function normalizePublicSharePayload(value: unknown): PublicTripPayload | null {
  const raw = (Array.isArray(value) ? value[0] : value) as Record<string, any> | null;
  if (!raw || raw.share?.is_active === false || raw.is_active === false) return null;
  const rawTrip = (raw.trip ?? {}) as Record<string, any>;
  const tripId = String(rawTrip.id ?? raw.share?.trip_id ?? raw.trip_id ?? '');
  if (!tripId) return null;
  const rawShare = (raw.share ?? raw) as Record<string, any>;
  const trip: PublicTripSummary = {
    id: tripId,
    title: String(rawTrip.title ?? '未命名行程'),
    destination: String(rawTrip.destination ?? ''),
    start_date: String(rawTrip.start_date ?? ''),
    end_date: String(rawTrip.end_date ?? ''),
    default_departure_time: rawTrip.default_departure_time ?? null,
    timezone: String(rawTrip.timezone ?? 'Asia/Taipei'),
  };
  const includeExpenses = Boolean(rawShare.include_expenses);
  const rawItems = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.itinerary_items) ? raw.itinerary_items : [];
  const rawExpenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  return {
    share: {
      id: String(rawShare.id ?? ''),
      trip_id: tripId,
      share_token: String(rawShare.share_token ?? ''),
      is_active: true,
      include_expenses: includeExpenses,
    },
    trip,
    items: rawItems.map((item, index) => normalizeItem(item as Partial<ItineraryItem>, index, tripId)),
    expenses: includeExpenses ? rawExpenses.map((expense) => ({
      id: String(expense.id ?? ''),
      title: String(expense.title ?? ''),
      amount: Number(expense.amount ?? 0),
      currency: String(expense.currency ?? 'TWD'),
      category: expense.category == null ? null : String(expense.category),
    })) : [],
  };
}

export async function createTripShare(input: { trip_id: string; created_by: string; include_expenses?: boolean }, random: () => number = Math.random): Promise<TripShare> {
  const payload = { ...input, share_token: createShareToken(random), include_expenses: input.include_expenses ?? false };
  const { data, error } = await supabase.from('trip_shares').insert(payload).select().single();
  if (error) throw error;
  return data as TripShare;
}

export async function listTripShares(tripId: string): Promise<TripShare[]> {
  const { data, error } = await supabase.from('trip_shares').select('*').eq('trip_id', tripId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TripShare[];
}

export async function updateTripShare(id: string, tripId: string, changes: { include_expenses?: boolean; is_active?: boolean }): Promise<TripShare> {
  const { data, error } = await supabase.from('trip_shares').update(changes).eq('id', id).eq('trip_id', tripId).select().single();
  if (error) throw error;
  return data as TripShare;
}

export async function revokeTripShare(id: string, tripId: string): Promise<TripShare> {
  return updateTripShare(id, tripId, { is_active: false });
}

/** Public endpoint backed by a SECURITY DEFINER RPC; no authenticated session is required. */
export async function getPublicTripByToken(token: string): Promise<PublicTripPayload | null> {
  const normalized = token.trim();
  if (!normalized) return null;
  const { data, error } = await supabase.rpc('get_public_trip_by_share_token', { p_share_token: normalized });
  if (error) throw error;
  return normalizePublicSharePayload(data);
}
