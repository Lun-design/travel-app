import { supabase } from './supabase';
import { listItineraryItems, saveItineraryItem, deleteItineraryItem } from './itinerary-api';
import { buildTripPayload } from './trip-validation';
export type Trip = { id: string; title: string; destination: string; start_date: string; end_date: string; invite_code: string };
export type TripMember = { trip_id: string; user_id: string; role: 'owner' | 'editor' | 'viewer'; joined_at: string };
export type TripMemberWithProfile = TripMember & { profile?: { display_name: string | null; avatar_url: string | null } | null };
export async function getTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase.from('trips').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Trip;
}
export async function listTripMembers(tripId: string): Promise<TripMemberWithProfile[]> {
  const { data, error } = await supabase.from('trip_members').select('*, profile:profiles(display_name, avatar_url)').eq('trip_id', tripId).order('joined_at');
  if (error) throw error;
  return (data ?? []) as TripMemberWithProfile[];
}
export async function joinTripByInvite(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_trip_by_invite', { p_invite_code: inviteCode });
  if (error) throw error;
  return data as string;
}
export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase.from('trips').select('*').order('start_date', { ascending: true });
  if (error) {
    console.error('[Supabase] listTrips failed', { message: error.message, details: error.details, hint: error.hint, code: error.code, status: (error as typeof error & { status?: number }).status });
    throw error;
  }
  return (data ?? []) as Trip[];
}
export async function createTrip(input: Pick<Trip, 'title' | 'destination' | 'start_date' | 'end_date'> & { created_by: string }): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const { data: session } = await supabase.auth.getSession();
  console.log('[Supabase] createTrip auth context', {
    userId: auth.user?.id ?? null,
    hasAccessToken: Boolean(session.session?.access_token),
  });
  const payload = buildTripPayload(input, auth.user?.id ?? '');
  const { error } = await supabase.from('trips').insert(payload);
  if (error) { console.error('[Supabase] createTrip failed', { message: error.message, details: error.details, hint: error.hint, code: error.code, status: (error as typeof error & { status?: number }).status }); throw error; }
}
export { listItineraryItems, saveItineraryItem, deleteItineraryItem };
