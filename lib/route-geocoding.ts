import { searchPlaces, type GeocodingResult } from './geocoding';
import { searchGooglePlacesText } from './google-places';

export type RouteCoordinateItem = {
  id: string;
  location_name?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type RouteCoordinateResolver = (query: string) => Promise<readonly Pick<GeocodingResult, 'latitude' | 'longitude' | 'title'>[]>;

export type RouteCoordinateResolution<T extends RouteCoordinateItem> = {
  items: T[];
  resolvedIds: string[];
};

async function defaultRouteCoordinateResolver(query: string): Promise<readonly Pick<GeocodingResult, 'latitude' | 'longitude' | 'title'>[]> {
  // Autocomplete suggestions intentionally do not contain coordinates. Use
  // Places Text Search first, then fall back to the existing Google/OSM
  // geocoder when a key is unavailable or the text search has no result.
  const googleResults = await searchGooglePlacesText(query).catch(() => []);
  if (googleResults.some((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))) return googleResults;
  return searchPlaces(query);
}

export function hasValidRouteCoordinates(item: RouteCoordinateItem): boolean {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

/**
 * Resolve manually entered addresses before route calculation. The resolver
 * is injectable so the pure state transition remains deterministic in tests.
 */
export async function resolveMissingRouteCoordinates<T extends RouteCoordinateItem>(
  items: readonly T[],
  resolver: RouteCoordinateResolver = defaultRouteCoordinateResolver,
): Promise<RouteCoordinateResolution<T>> {
  const missing = items.filter((item) => !hasValidRouteCoordinates(item));
  if (!missing.length) return { items: items.map((item) => ({ ...item })), resolvedIds: [] };

  const resolved = await Promise.all(missing.map(async (item) => {
    const query = item.address?.trim() || item.location_name?.trim() || '';
    if (!query) return null;
    try {
      const results = await resolver(query);
      const match = results.find((result) => Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude)));
      return match ? { id: item.id, latitude: Number(match.latitude), longitude: Number(match.longitude) } : null;
    } catch {
      return null;
    }
  }));
  const byId = new Map(resolved.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).map((entry) => [entry.id, entry]));
  const resolvedIds = [...byId.keys()];
  return {
    items: items.map((item) => {
      const coordinates = byId.get(item.id);
      return coordinates ? { ...item, latitude: coordinates.latitude, longitude: coordinates.longitude } : { ...item };
    }),
    resolvedIds,
  };
}
