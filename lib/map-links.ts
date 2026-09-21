import type { TravelMode } from './routes';

/** Build a Google Maps directions link when an item has valid coordinates. */
export function getGoogleMapsDirectionsUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/**
 * Build a destination-only Google Maps Directions link for an itinerary item.
 *
 * Card actions intentionally omit `origin`: Google Maps then uses the
 * traveller's current location.  Place IDs and human-readable destinations
 * are preferred over raw coordinates so custom labels do not send travellers
 * to a nearby but incorrect point.
 */
export type NavigationPlace = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  place_id?: string | null;
  placeId?: string | null;
  googlePlaceId?: string | null;
  google_place_id?: string | null;
  location_name?: string | null;
  title?: string | null;
  address?: string | null;
  mode?: TravelMode;
};

export function getGoogleMapsNavigationUrl(place: NavigationPlace): string {
  const placeId = [place.place_id, place.placeId, place.googlePlaceId, place.google_place_id]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim();
  const mode = place.mode ?? 'DRIVING';
  const travelMode = mode === 'TRANSIT' ? 'transit' : mode === 'WALKING' ? 'walking' : 'driving';
  const directionFlag = mode === 'TRANSIT' ? 'r' : mode === 'WALKING' ? 'w' : 'd';
  const withMode = (destinationQuery: string) =>
    `https://www.google.com/maps/dir/?api=1&${destinationQuery}&travelmode=${travelMode}&dirflg=${directionFlag}`;
  if (placeId) {
    return withMode(`destination=Google&destination_place_id=${encodeURIComponent(placeId)}`);
  }

  const address = typeof place.address === 'string' ? place.address.trim() : '';
  if (address) {
    return withMode(`destination=${encodeURIComponent(address)}`);
  }

  const query = [place.title, place.location_name]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim();
  if (query) return withMode(`destination=${encodeURIComponent(query)}`);

  const latitude = normalizeCoordinate(place.latitude);
  const longitude = normalizeCoordinate(place.longitude);
  if (latitude !== null && longitude !== null) {
    return withMode(`destination=${encodeURIComponent(`${latitude},${longitude}`)}`);
  }

  return withMode(`destination=${encodeURIComponent('未命名景點')}`);
}

function normalizeCoordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
