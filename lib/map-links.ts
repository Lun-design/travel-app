/** Build a Google Maps directions link when an item has valid coordinates. */
export function getGoogleMapsDirectionsUrl(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const destination = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
