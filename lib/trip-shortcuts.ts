import type { ItineraryItem } from './itinerary';
import type { OfflineScope } from './offline-store';
import { getTimeContextLabel } from './time-context';
export type ShortcutKind = 'hotel' | 'meeting';
export type ShortcutPin = { id: string; kind: ShortcutKind };
export function shortcutStorageKey(scope: OfflineScope) {
  return `travel-planner-offline:shortcuts:v1:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.tripId)}`;
}
/** Same browser preference mechanism as the app theme; existing logout cleanup clears this prefix. */
export const shortcutPreferences = {
  async getItem(key: string): Promise<string | null> {
    if (typeof globalThis.localStorage === 'undefined') throw new Error('此裝置不支援本機釘選。');
    return globalThis.localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof globalThis.localStorage === 'undefined') throw new Error('此裝置不支援本機釘選。');
    globalThis.localStorage.setItem(key, value);
  },
};
export function parseShortcutPins(raw: string | null): ShortcutPin[] {
  try {
    const values: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.filter((v): v is ShortcutPin => {
      if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id.trim() || !['hotel', 'meeting'].includes(v.kind)) return false;
      const key = `${v.kind}:${v.id}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 12);
  } catch { return []; }
}
export function resolveShortcutItems(pins: readonly ShortcutPin[], items: readonly ItineraryItem[], tripId: string) {
  const byId = new Map(items.filter((item) => item?.trip_id === tripId).map((item) => [item.id, item]));
  return pins.flatMap((pin) => { const item = byId.get(pin.id); return item ? [{ pin, item }] : []; });
}
/** Explicitly excludes notes, booking references and other private metadata. */
export function buildShortcutText(item: ItineraryItem, kind: ShortcutKind, timezone?: string) {
  return [kind === 'hotel' ? '住宿資訊' : '集合資訊', item.location_name, `Day ${item.day_number}${item.time ? ` · ${item.time.slice(0, 5)} · ${getTimeContextLabel(item, timezone)}` : ''}`, item.address?.trim()].filter(Boolean).join('\n');
}
