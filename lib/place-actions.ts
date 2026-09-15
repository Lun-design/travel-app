export function formatPlaceAddress(address: string | null | undefined): string | null {
  const value = typeof address === 'string' ? address.trim() : '';
  return value || null;
}

// Keep image resolution discoverable alongside the other place presentation
// helpers while the implementation remains independently testable.
export {
  EXACT_SPOT_MAP,
  clearSpotImageResolutionCache,
  getGooglePhotoUrl,
  getSpotImageFallback,
  getSpotImageUrl,
  resolveSpotImage,
  resolveSpotImageUrl,
  SPOT_IMAGE_FALLBACK_VARIANTS,
  SPOT_IMAGE_FALLBACKS,
} from './spot-image';
