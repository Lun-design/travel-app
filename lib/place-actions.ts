export function formatPlaceAddress(address: string | null | undefined): string | null {
  const value = typeof address === 'string' ? address.trim() : '';
  return value || null;
}

// Keep image resolution discoverable alongside the other place presentation
// helpers while the implementation remains independently testable.
export {
  EXACT_SPOT_MAP,
  getGooglePhotoUrl,
  getSpotImageFallback,
  getSpotImageUrl,
  SPOT_IMAGE_FALLBACKS,
} from './spot-image';
