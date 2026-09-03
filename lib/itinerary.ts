export type ItineraryItem = {
  id: string; trip_id: string; day_number: number; time: string | null;
  location_name: string; address: string | null; latitude: number | null; longitude: number | null;
  notes: string | null; category: string; created_by: string; duration_minutes?: number | null; difficulty?: string | null;
};
export function filterAndSortItems(items: ItineraryItem[], day: number) {
  return items.filter((x) => x.day_number === day).sort((a, b) => (a.time ? (b.time ? a.time.localeCompare(b.time) : -1) : 1));
}
export function coordinatesForPolyline(items: ItineraryItem[], day: number) {
  return filterAndSortItems(items, day).filter((x): x is ItineraryItem & { latitude: number; longitude: number } => x.latitude != null && x.longitude != null).map((x) => ({ latitude: x.latitude, longitude: x.longitude }));
}
