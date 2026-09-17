/**
 * Platform-safe glyphs used by itinerary category badges. Keeping this
 * mapping independent from React Native lets native and web share the same
 * fallback behaviour without relying on an icon-font package.
 */
const CATEGORY_ICONS: Record<string, string> = {
  flight: '✈️',
  transit: '🚆',
  hotel: '🏨',
  food: '🍴',
  restaurant: '🍴',
  spot: '📍',
  outdoor: '🌿',
  trail: '🥾',
};

export function getCategoryIcon(category?: string | null): string {
  const key = String(category ?? '').trim().toLowerCase();
  return CATEGORY_ICONS[key] ?? '📌';
}
