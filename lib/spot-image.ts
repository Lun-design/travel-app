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

/**
 * Curated images for frequently visited destinations.  The keys are kept in
 * their display language so this table is also useful to callers that want to
 * inspect or override a specific destination.  Values are stable Unsplash
 * CDN URLs (never a random image endpoint).
 */
export const EXACT_SPOT_MAP: Record<string, string> = {
  關西國際機場: SPOT_IMAGE_FALLBACKS.flight,
  関西国際空港: SPOT_IMAGE_FALLBACKS.flight,
  'kansai international airport': SPOT_IMAGE_FALLBACKS.flight,
  黑門市場: SPOT_IMAGE_FALLBACKS.food,
  黒門市場: SPOT_IMAGE_FALLBACKS.food,
  'kuromon market': SPOT_IMAGE_FALLBACKS.food,
  難波: SPOT_IMAGE_FALLBACKS.spot,
  namba: SPOT_IMAGE_FALLBACKS.spot,
  道頓堀: SPOT_IMAGE_FALLBACKS.food,
  dotonbori: SPOT_IMAGE_FALLBACKS.food,
  梅田: SPOT_IMAGE_FALLBACKS.spot,
  umeda: SPOT_IMAGE_FALLBACKS.spot,
  心齋橋: SPOT_IMAGE_FALLBACKS.spot,
  心斎橋: SPOT_IMAGE_FALLBACKS.spot,
  shinsaibashi: SPOT_IMAGE_FALLBACKS.spot,
  大阪城: SPOT_IMAGE_FALLBACKS.spot,
  'osaka castle': SPOT_IMAGE_FALLBACKS.spot,
  通天閣: SPOT_IMAGE_FALLBACKS.spot,
  tsutenkaku: SPOT_IMAGE_FALLBACKS.spot,
  清水寺: SPOT_IMAGE_FALLBACKS.spot,
  'kiyomizu dera': SPOT_IMAGE_FALLBACKS.spot,
  東京鐵塔: SPOT_IMAGE_FALLBACKS.spot,
  東京タワー: SPOT_IMAGE_FALLBACKS.spot,
  'tokyo tower': SPOT_IMAGE_FALLBACKS.spot,
  環球影城: SPOT_IMAGE_FALLBACKS.spot,
  'universal studios japan': SPOT_IMAGE_FALLBACKS.spot,
  usj: SPOT_IMAGE_FALLBACKS.spot,
  梅田空中庭園: SPOT_IMAGE_FALLBACKS.spot,
  海遊館: SPOT_IMAGE_FALLBACKS.spot,
  天保山: SPOT_IMAGE_FALLBACKS.spot,
  住吉大社: SPOT_IMAGE_FALLBACKS.spot,
  大丸: SPOT_IMAGE_FALLBACKS.spot,
  'lucua osaka': SPOT_IMAGE_FALLBACKS.spot,
};

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

/** Convert free-form spot text into stable category tags for presentation. */
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

/** Build a Google Places Photo URL when a reference and public API key exist. */
export function getGooglePhotoUrl(reference: string): string | null {
  const key =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      : undefined;
  const cleanReference = nonEmpty(reference);
  const cleanKey = nonEmpty(key);
  if (!cleanReference || !cleanKey) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&photo_reference=${encodeURIComponent(cleanReference)}&key=${encodeURIComponent(cleanKey)}`;
}

function normalizeSpotText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function getExactSpotImage(spot: SpotImageInput): string | null {
  const candidates = [nonEmpty(spot.name), nonEmpty(spot.location_name), nonEmpty(spot.address)].filter(
    (value): value is string => Boolean(value),
  );
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSpotText(candidate);
    if (!normalizedCandidate) continue;
    const match = Object.entries(EXACT_SPOT_MAP).find(([name]) => {
      const normalizedName = normalizeSpotText(name);
      return normalizedCandidate.includes(normalizedName) || normalizedName.includes(normalizedCandidate);
    });
    if (match) return match[1];
  }
  return null;
}

/**
 * Resolve an itinerary spot to an image URL.
 *
 * Existing uploads/API values always win. For a Google Places photo reference
 * we use the Places Photo endpoint when a public key is configured. If the
 * reference is unavailable or not configured, a curated destination image is
 * preferred, followed by a stable category image. The UI should still handle
 * an image load error and show its local category icon.
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

  const exactImage = getExactSpotImage(spot);
  if (exactImage) return exactImage;

  return getSpotImageFallback(spot.category);
}
