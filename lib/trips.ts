import { supabase } from './supabase';
import { listItineraryItems, saveItineraryItem, deleteItineraryItem, updateItineraryItemsOrder } from './itinerary-api';
import { buildTripPayload } from './trip-validation';
import { normalizeTimezone } from './timezone';
import { createLocalId, enqueueOfflineMutation, patchOfflineSnapshot, resolveOfflineScope, shouldQueueOffline, type OfflineApiOptions } from './offline-data';
import { offlineStore } from './offline-store';

export type Trip = { id: string; title: string; destination: string; start_date: string; end_date: string; invite_code: string; created_by: string; default_departure_time: string | null; timezone: string };
export type TripUpdateInput = Partial<Pick<Trip, 'start_date' | 'end_date' | 'default_departure_time' | 'timezone'>>;
export type TripMember = { trip_id: string; user_id: string; role: 'owner' | 'editor' | 'viewer'; joined_at: string };
export type TripMemberWithProfile = TripMember & {
  profile?: {
    display_name: string | null;
    full_name?: string | null;
    email?: string | null;
    avatar_url: string | null;
  } | null;
};
export type TripWithMembers = { trip: Trip; members: TripMemberWithProfile[] };

function normalizeTrip(row: unknown): Trip {
  return { ...(row as Trip), timezone: normalizeTimezone((row as Partial<Trip>)?.timezone) };
}

async function currentUserId(): Promise<string | null> {
  try { return (await supabase.auth.getSession()).data.session?.user.id ?? null; } catch { return null; }
}

export async function getTrip(id: string, options: OfflineApiOptions = {}): Promise<Trip> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(id, options.offlineScope, currentUserId);
  try {
    const { data, error } = await supabase.from('trips').select('*').eq('id', id).single();
    if (error) throw error;
    const trip = normalizeTrip(data);
    await patchOfflineSnapshot(store, scope, { trip });
    return trip;
  } catch (error) {
    const cached = (await store.getSnapshot(scope))?.trip;
    if (!options.replaying && shouldQueueOffline(error) && cached) return normalizeTrip(cached);
    throw error;
  }
}

export async function listTripMembers(tripId: string, options: OfflineApiOptions = {}): Promise<TripMemberWithProfile[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(tripId, options.offlineScope, currentUserId);
  try {
    const { data, error } = await supabase.from('trip_members').select('*, profile:profiles(display_name, full_name, email, avatar_url)').eq('trip_id', tripId).order('joined_at');
    if (error) throw error;
    const members = (data ?? []) as TripMemberWithProfile[];
    await patchOfflineSnapshot(store, scope, { members });
    return members;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) return ((await store.getSnapshot(scope))?.members ?? []) as TripMemberWithProfile[];
    throw error;
  }
}

export async function joinTripByInvite(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_trip_by_invite', { p_invite_code: inviteCode });
  if (error) throw error;
  return data as string;
}

export async function listTrips(options: OfflineApiOptions = {}): Promise<Trip[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope('home', options.offlineScope, currentUserId);
  try {
    const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: true });
    if (error) throw error;
    const trips = (data ?? []).map(normalizeTrip);
    await Promise.all(trips.map((trip) => patchOfflineSnapshot(store, { userId: scope.userId, tripId: trip.id }, { trip })));
    return trips;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) return (await store.listSnapshots(scope.userId)).map(({ snapshot }) => snapshot.trip).filter(Boolean).map(normalizeTrip).sort((left, right) => left.start_date.localeCompare(right.start_date));
    console.error('[Supabase] listTrips failed', { message: (error as any)?.message, details: (error as any)?.details, hint: (error as any)?.hint, code: (error as any)?.code });
    throw error;
  }
}

function isUnavailableTripAggregation(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === '42883' || value?.code === 'PGRST202' || /function .*list_trips_with_members.*(does not exist|not found)|schema cache/i.test(value?.message ?? '');
}

function parseMembers(value: unknown): TripMemberWithProfile[] {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value as TripMemberWithProfile[] : [];
}

function mapAggregatedTrip(row: Record<string, unknown>): TripWithMembers {
  const { members, ...tripRow } = row;
  return { trip: normalizeTrip(tripRow), members: parseMembers(members) };
}

export async function listTripsWithMembers(options: OfflineApiOptions = {}): Promise<TripWithMembers[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope('home', options.offlineScope, currentUserId);
  try {
    const { data, error } = await supabase.rpc('list_trips_with_members');
    if (error) throw error;
    const result = ((data ?? []) as Record<string, unknown>[]).map(mapAggregatedTrip);
    await Promise.all(result.map(({ trip, members }) => patchOfflineSnapshot(store, { userId: scope.userId, tripId: trip.id }, { trip, members })));
    return result;
  } catch (error) {
    if (isUnavailableTripAggregation(error)) {
      const trips = await listTrips({ ...options, offlineScope: scope, store });
      return Promise.all(trips.map(async (trip) => ({
        trip,
        members: await listTripMembers(trip.id, { ...options, offlineScope: { userId: scope.userId, tripId: trip.id }, store }),
      })));
    }
    if (!options.replaying && shouldQueueOffline(error)) {
      return (await store.listSnapshots(scope.userId))
        .map(({ snapshot }) => snapshot.trip ? { trip: normalizeTrip(snapshot.trip), members: snapshot.members as TripMemberWithProfile[] } : null)
        .filter((value): value is TripWithMembers => Boolean(value))
        .sort((left, right) => left.trip.start_date.localeCompare(right.trip.start_date));
    }
    throw error;
  }
}

export async function createTrip(input: Pick<Trip, 'title' | 'destination' | 'start_date' | 'end_date'> & { created_by: string; default_departure_time?: string | null; timezone?: string | null }, options: OfflineApiOptions = {}): Promise<void> {
  let authUserId = input.created_by ?? '';
  try {
    const { data, error: authError } = await supabase.auth.getSession();
    if (authError && !shouldQueueOffline(authError)) throw authError;
    authUserId = data.session?.user.id ?? authUserId;
  } catch (error) {
    if (!shouldQueueOffline(error)) throw error;
  }
  const payload = buildTripPayload({ ...input, timezone: normalizeTimezone(input.timezone) }, authUserId);
  try {
    const { error } = await supabase.from('trips').insert(payload);
    if (error) throw error;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      const scope = await resolveOfflineScope('home', options.offlineScope, currentUserId);
      const store = options.store ?? offlineStore;
      const localId = createLocalId('offline-trip');
      const optimistic = normalizeTrip({
        ...payload,
        id: localId,
        invite_code: '',
        default_departure_time: input.default_departure_time ?? null,
        timezone: normalizeTimezone(input.timezone),
      });
      await patchOfflineSnapshot(store, { userId: scope.userId, tripId: localId }, { trip: optimistic, members: [] });
      await enqueueOfflineMutation(store, { scope, entity: 'trip', operation: 'create', resourceId: localId, payload });
      return;
    }
    throw error;
  }
}

export async function updateTrip(id: string, changes: TripUpdateInput, options: OfflineApiOptions = {}): Promise<Trip> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(id, options.offlineScope, currentUserId);
  const payload = changes.timezone === undefined ? changes : { ...changes, timezone: normalizeTimezone(changes.timezone) };
  try {
    const { data, error } = await supabase.from('trips').update(payload).eq('id', id).select().single();
    if (error) throw error;
    const trip = normalizeTrip(data);
    await patchOfflineSnapshot(store, scope, { trip });
    return trip;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      const cached = (await store.getSnapshot(scope))?.trip;
      if (!cached) throw error;
      const trip = normalizeTrip({ ...(cached as Trip), ...payload });
      await enqueueOfflineMutation(store, { scope, entity: 'trip', operation: 'update', resourceId: id, payload });
      await patchOfflineSnapshot(store, scope, { trip });
      return trip;
    }
    throw error;
  }
}

export { listItineraryItems, saveItineraryItem, deleteItineraryItem, updateItineraryItemsOrder };
