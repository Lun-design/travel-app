export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type OpeningPeriod = { open: string; close: string };
export type OpeningHoursDay = { closed?: boolean; periods?: OpeningPeriod[] };
export type OpeningHours = Partial<Record<Weekday, OpeningHoursDay>>;

export type ItineraryItem = {
  id: string; trip_id: string; day_number: number; position: number; time: string | null;
  location_name: string; address: string | null; latitude: number | null; longitude: number | null;
  notes: string | null; category: string; created_by: string; duration_minutes?: number | null; difficulty?: string | null;
  opening_hours?: OpeningHours | null;
};

export type Coordinate = { latitude: number; longitude: number };
export type MapMarkerData = Coordinate & {
  id: string;
  order: number;
  title: string;
  description: string | null;
};
export type RouteSegment = {
  fromId: string;
  toId: string;
  distanceKm: number;
  estimatedDriveMinutes: number;
};

export function filterAndSortItems(items: ItineraryItem[], day: number) {
  return items.filter((x) => x.day_number === day).sort((a, b) => {
    if (Number.isFinite(a.position) && Number.isFinite(b.position)) return a.position - b.position;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return a.time ? -1 : 1;
  });
}
export function coordinatesForPolyline(items: ItineraryItem[], day: number) {
  return mapMarkersForDay(items, day).map(({ latitude, longitude }) => ({ latitude, longitude }));
}

export function mapMarkersForDay(items: ItineraryItem[], day: number): MapMarkerData[] {
  return filterAndSortItems(items, day)
    .filter((item): item is ItineraryItem & Coordinate => item.latitude != null && item.longitude != null)
    .map((item, index) => ({
      id: item.id,
      order: index + 1,
      title: item.location_name,
      description: item.notes || item.address,
      latitude: item.latitude,
      longitude: item.longitude,
    }));
}

export function haversineDistanceKm(from: Coordinate, to: Coordinate) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const startLatitude = toRadians(from.latitude);
  const endLatitude = toRadians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildRouteSegments(items: ItineraryItem[], day: number, averageSpeedKmh = 35): RouteSegment[] {
  const markers = mapMarkersForDay(items, day);
  return markers.slice(0, -1).map((from, index) => {
    const to = markers[index + 1];
    const distanceKm = haversineDistanceKm(from, to);
    return {
      fromId: from.id,
      toId: to.id,
      distanceKm,
      estimatedDriveMinutes: Math.max(1, Math.round(distanceKm / averageSpeedKmh * 60)),
    };
  });
}

export function reorderItineraryItems(items: ItineraryItem[], fromIndex: number, toIndex: number): ItineraryItem[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) return items;
  const reordered = [...items];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered.map((item, position) => ({ ...item, position }));
}
