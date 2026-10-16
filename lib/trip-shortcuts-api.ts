import { supabase } from './supabase';
import { parseShortcutPins, type ShortcutPin } from './trip-shortcuts';

function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (['PGRST205', '42P01'].includes(error.code ?? '')) {
    throw new Error('快捷資訊尚未啟用雲端同步，請管理員套用 trip_info_pins Migration；原本機資料仍保留。');
  }
  throw new Error(error.message || '無法同步快捷資訊，請檢查連線及編輯權限。');
}

export async function listTripInfoPins(tripId: string): Promise<ShortcutPin[]> {
  const { data, error } = await supabase.from('trip_info_pins').select('item_id,kind').eq('trip_id', tripId);
  check(error);
  // Never hide persisted pins if concurrent clients exceed the new-selection UI cap.
  return parseShortcutPins(JSON.stringify((data ?? []).map((row) => ({ id: row.item_id, kind: row.kind }))), Infinity);
}

/** Change only the selected pin: never overwrite another device's entire list. */
export async function setTripInfoPin(tripId: string, pin: ShortcutPin, selected: boolean): Promise<void> {
  if (!tripId.trim() || !pin.id.trim() || !['hotel', 'meeting'].includes(pin.kind)) throw new Error('無效的快捷資訊。');
  const table = supabase.from('trip_info_pins');
  const { error } = selected
    ? await table.upsert({ trip_id: tripId, item_id: pin.id, kind: pin.kind }, { onConflict: 'trip_id,item_id,kind', ignoreDuplicates: true })
    : await table.delete().eq('trip_id', tripId).eq('item_id', pin.id).eq('kind', pin.kind);
  check(error);
}
