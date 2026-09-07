import { supabase } from './supabase';

export type CloneTripOptions = {
  shareToken?: string | null;
};

/** Clone a trip and its planning data in one database transaction. */
export async function cloneTripById(sourceTripId: string, options: CloneTripOptions = {}): Promise<string> {
  const tripId = sourceTripId.trim();
  if (!tripId) throw new Error('找不到要複製的行程。');

  const { data, error } = await supabase.rpc('clone_trip_by_id', {
    p_trip_id: tripId,
    p_share_token: options.shareToken?.trim() || null,
  });
  if (error) throw error;

  const value = Array.isArray(data) ? data[0] : data;
  const clonedTripId = typeof value === 'string' ? value : (value as { id?: unknown } | null)?.id;
  if (typeof clonedTripId !== 'string' || !clonedTripId.trim()) {
    throw new Error('行程複製失敗，未取得新行程 ID。');
  }
  return clonedTripId;
}

