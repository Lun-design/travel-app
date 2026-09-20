/** Build a Google Maps directions link when an item has valid coordinates. */
export function getGoogleMapsDirectionsUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/**
 * Build a precise Google Maps search/navigation link for an itinerary item.
 * Place IDs are preferred over coordinates, followed by address and title.
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
};

export function getGoogleMapsNavigationUrl(place: NavigationPlace): string {
  const placeId = [place.place_id, place.placeId, place.googlePlaceId, place.google_place_id]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim();
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;
  }

  const latitude = normalizeCoordinate(place.latitude);
  const longitude = normalizeCoordinate(place.longitude);
  if (latitude !== null && longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  const address = typeof place.address === 'string' ? place.address.trim() : '';
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  const query = [place.title, place.location_name]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() ?? '未命名景點';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function normalizeCoordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
