/**
 * Image resolution helpers for itinerary spots.
 *
 * The resolver is intentionally side-effect free: cards can calculate a URL
 * during render without making a network request or depending on browser APIs.
 */
export type SpotImageCategory = 'food' | 'hotel' | 'flight' | 'spot' | 'trail' | 'outdoor' | string;

export type SpotImageInput = {
  name?: string | null;
  location_name?: string | null;
  address?: string | null;
  category?: SpotImageCategory | null;
  imageUrl?: string | null;
  image_url?: string | null;
  photoReference?: string | null;
  photo_reference?: string | null;
};

/** Stable editorial fallbacks used when a remote source cannot be loaded. */
export const SPOT_IMAGE_FALLBACKS: Record<string, string> = {
  food: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&h=300&fit=crop&auto=format',
  hotel: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&h=300&fit=crop&auto=format',
  flight: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=300&h=300&fit=crop&auto=format',
  spot: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=300&h=300&fit=crop&auto=format',
  trail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300&h=300&fit=crop&auto=format',
  outdoor: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=300&h=300&fit=crop&auto=format',
};

const DEFAULT_FALLBACK = SPOT_IMAGE_FALLBACKS.spot;

const KEYWORD_TAGS: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /機場|airport|terminal|kix|tpe/i, tags: ['airport'] },
  { pattern: /市場|餐館|餐廳|美食|食堂|拉麵|燒肉|火鍋|居酒屋|道頓堀|黑門/i, tags: ['japan', 'food'] },
  { pattern: /飯店|酒店|住宿|旅館|hotel|inn/i, tags: ['hotel'] },
  { pattern: /公園|步道|海邊|沙灘|農場|露營|自然|山|湖|park|trail|beach|nature/i, tags: ['japan', 'nature'] },
  { pattern: /塔|城|寺|神社|古蹟|展覽|博物館|地標|tower|temple|museum|landmark/i, tags: ['japan', 'landmark'] },
];

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function categoryKey(category: SpotImageCategory | null | undefined): string {
  const key = nonEmpty(category)?.toLowerCase();
  return key && SPOT_IMAGE_FALLBACKS[key] ? key : 'spot';
}

/** Return the best available category fallback image URL. */
export function getSpotImageFallback(category?: SpotImageCategory | null): string {
  return SPOT_IMAGE_FALLBACKS[categoryKey(category)] ?? DEFAULT_FALLBACK;
}

/** Convert free-form spot text into a small set of stable LoremFlickr tags. */
export function getSpotImageTags(spot: Pick<SpotImageInput, 'name' | 'location_name' | 'address' | 'category'>): string[] {
  const text = [spot.name, spot.location_name, spot.address].filter(Boolean).join(' ');
  const match = KEYWORD_TAGS.find(({ pattern }) => pattern.test(text));
  if (match) return match.tags;
  const category = categoryKey(spot.category);
  if (category === 'food') return ['japan', 'food'];
  if (category === 'hotel') return ['hotel'];
  if (category === 'flight') return ['airport'];
  if (category === 'trail' || category === 'outdoor') return ['japan', 'nature'];
  return ['travel'];
}

function getGooglePhotoUrl(reference: string): string | null {
  const key = typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined;
  if (!key) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${encodeURIComponent(reference)}&key=${encodeURIComponent(key)}`;
}

/**
 * Resolve an itinerary spot to an image URL.
 *
 * Existing uploads/API values always win. For a Google Places photo reference
 * we use the Places Photo endpoint when a public key is configured; otherwise
 * a deterministic LoremFlickr query gives the card a useful image without
 * requiring another API call. The UI should still handle an image load error
 * and show its local category icon.
 */
export function getSpotImageUrl(spot: SpotImageInput | null | undefined): string {
  if (!spot) return DEFAULT_FALLBACK;

  const explicit = nonEmpty(spot.imageUrl) ?? nonEmpty(spot.image_url);
  if (explicit) return explicit;

  const photoReference = nonEmpty(spot.photoReference) ?? nonEmpty(spot.photo_reference);
  if (photoReference) {
    const googlePhoto = getGooglePhotoUrl(photoReference);
    if (googlePhoto) return googlePhoto;
  }

  const name = nonEmpty(spot.name) ?? nonEmpty(spot.location_name);
  const address = nonEmpty(spot.address);
  const category = categoryKey(spot.category);
  // A category alone is too broad for a useful destination image; use the
  // curated category asset until a spot name/address is available.
  if (name || address) return `https://loremflickr.com/300/300/${getSpotImageTags({ name, address, category }).join(',')}`;
  return getSpotImageFallback(category);
}
