/** Build a Google Maps directions link when an item has valid coordinates. */
export function getGoogleMapsDirectionsUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

/**
 * Build a navigation link for an itinerary item.
 *
 * Coordinates give the most precise directions URL.  For manually entered
 * spots that have not been geocoded yet, use a Google Maps title search so
 * the action remains useful and clickable instead of appearing disabled.
 */
export type NavigationPlace = {
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  title?: string | null;
  address?: string | null;
};

export function getGoogleMapsNavigationUrl(place: NavigationPlace): string {
  const directionsUrl = getGoogleMapsDirectionsUrl(place.latitude, place.longitude);
  if (directionsUrl) return directionsUrl;

  const query = [place.location_name, place.title, place.address]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() ?? '景點';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
