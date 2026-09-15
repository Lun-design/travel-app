/**
 * Image resolution helpers for itinerary spots.
 *
 * The resolver is intentionally side-effect free: cards can calculate a URL
 * during render without making a network request or depending on browser APIs.
 */
import { fetchGooglePlaceDetails, isGooglePhotoResourceName, searchGooglePlacesText } from './google-places';

export type SpotImageCategory = 'food' | 'hotel' | 'flight' | 'spot' | 'trail' | 'outdoor' | string;

export type SpotImageInput = {
  id?: string | number | null;
  index?: number | null;
  placeId?: string | null;
  googlePlaceId?: string | null;
  google_place_id?: string | null;
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

const curatedUnsplash = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?w=300&h=300&fit=crop&auto=format`;

/** Stable variants used to avoid repeating one generic image for every spot. */
export const SPOT_IMAGE_FALLBACK_VARIANTS: Record<string, string[]> = {
  food: [
    SPOT_IMAGE_FALLBACKS.food,
    curatedUnsplash('photo-1517248135467-4c7edcad34c4'),
    curatedUnsplash('photo-1547592180-85f173990554'),
  ],
  hotel: [
    SPOT_IMAGE_FALLBACKS.hotel,
    curatedUnsplash('photo-1564501049412-61c2a3083791'),
    curatedUnsplash('photo-1582719478250-c89cae4dc85b'),
  ],
  flight: [
    SPOT_IMAGE_FALLBACKS.flight,
    curatedUnsplash('photo-1529070538774-1843cb3265df'),
    curatedUnsplash('photo-1542296332-2e4473faf563'),
  ],
  spot: [
    SPOT_IMAGE_FALLBACKS.spot,
    curatedUnsplash('photo-1476514525535-07fb3b4ae5f1'),
    curatedUnsplash('photo-1522083165195-3424ed129620'),
  ],
  trail: [
    SPOT_IMAGE_FALLBACKS.trail,
    curatedUnsplash('photo-1441974231531-c6227db76b6e'),
    curatedUnsplash('photo-1501854140801-50d01698950b'),
  ],
  outdoor: [
    SPOT_IMAGE_FALLBACKS.outdoor,
    curatedUnsplash('photo-1511497584788-876760111969'),
    curatedUnsplash('photo-1473445361085-b9a07f55608b'),
  ],
};

const EXACT_SPOT_IMAGES = {
  market: curatedUnsplash('photo-1504674900247-0877df9cc836'),
  dotonbori: curatedUnsplash('photo-1493976040374-85c8e12f0c0e'),
  umeda: curatedUnsplash('photo-1519501025264-65ba15a82390'),
  city: curatedUnsplash('photo-1540959733332-eab4deabeeaf'),
  coffee: curatedUnsplash('photo-1495474472287-4d71bcdd2085'),
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
  黑門市場: EXACT_SPOT_IMAGES.market,
  黒門市場: EXACT_SPOT_IMAGES.market,
  'kuromon market': EXACT_SPOT_IMAGES.market,
  '黑門市場海鮮': EXACT_SPOT_IMAGES.market,
  難波: EXACT_SPOT_IMAGES.city,
  namba: EXACT_SPOT_IMAGES.city,
  道頓堀: EXACT_SPOT_IMAGES.dotonbori,
  dotonbori: EXACT_SPOT_IMAGES.dotonbori,
  固力果: EXACT_SPOT_IMAGES.dotonbori,
  戎橋: EXACT_SPOT_IMAGES.dotonbori,
  梅田: EXACT_SPOT_IMAGES.umeda,
  umeda: EXACT_SPOT_IMAGES.umeda,
  lucua: EXACT_SPOT_IMAGES.umeda,
  'grand front': EXACT_SPOT_IMAGES.umeda,
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
  飯店: SPOT_IMAGE_FALLBACKS.hotel,
  辦理入住: SPOT_IMAGE_FALLBACKS.hotel,
  退房: SPOT_IMAGE_FALLBACKS.hotel,
  hotel: SPOT_IMAGE_FALLBACKS.hotel,
  咖啡廳: EXACT_SPOT_IMAGES.coffee,
  咖啡店: EXACT_SPOT_IMAGES.coffee,
  咖啡: EXACT_SPOT_IMAGES.coffee,
  cafe: EXACT_SPOT_IMAGES.coffee,
  休息: EXACT_SPOT_IMAGES.coffee,
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

/**
 * Pick a deterministic static image after a remote image has failed to load.
 *
 * This helper deliberately ignores the spot's explicit/remote URL.  A failed
 * URL must never be returned again (otherwise React Native/Web will keep
 * rendering the broken-image placeholder).  Curated destination images are
 * preferred, then the hashed category variants provide a stable alternative.
 */
export function getSpotImageFallbackUrl(spot: SpotImageInput | null | undefined, failedUrl?: string | null): string {
  const failed = nonEmpty(failedUrl);
  if (!spot) return getSpotImageFallback('spot');

  const exact = getExactSpotImage(spot);
  if (exact && exact !== failed) return exact;

  const category = categoryKey(spot.category);
  const variants = SPOT_IMAGE_FALLBACK_VARIANTS[category] ?? SPOT_IMAGE_FALLBACK_VARIANTS.spot;
  const preferred = getHashedFallback(spot);
  const candidates = [preferred, ...variants].filter((url, index, all) => url && all.indexOf(url) === index && url !== failed);
  return candidates[0] ?? variants.find((url) => url !== failed) ?? getSpotImageFallback(category);
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
function getGooglePhotoApiKey(apiKey?: string): string | null {
  const configuredKey = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    : undefined;
  return nonEmpty(apiKey) ?? nonEmpty(configuredKey);
}

const LEGACY_PHOTO_REFERENCE_PATTERN = /^[A-Za-z0-9._~:-]+$/u;

export function getGooglePhotoUrl(reference: unknown, apiKey?: string): string | null {
  const key = getGooglePhotoApiKey(apiKey);
  const cleanReference = nonEmpty(reference);
  if (!cleanReference || !key) return null;
  if (/^(?:undefined|null|\[object object\])$/iu.test(cleanReference)) return null;

  if (isGooglePhotoResourceName(cleanReference)) {
    return `https://places.googleapis.com/v1/${cleanReference}/media?maxWidthPx=400&key=${encodeURIComponent(key)}`;
  }

  // Legacy references are opaque URL-safe tokens. Reject paths, query
  // strings, and arbitrary objects before they can produce a guaranteed 400.
  if (!LEGACY_PHOTO_REFERENCE_PATTERN.test(cleanReference)) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(cleanReference)}&key=${encodeURIComponent(key)}`;
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

function spotSeed(spot: SpotImageInput): string | null {
  if (typeof spot.id === 'number' && Number.isFinite(spot.id)) return String(spot.id);
  return nonEmpty(spot.id) ?? nonEmpty(spot.name) ?? nonEmpty(spot.location_name) ?? nonEmpty(spot.address);
}

/** A small deterministic hash; unlike Math.random it remains stable per spot. */
function hashSpotSeed(seed: string, index: number): number {
  let hash = 0;
  for (const character of `${seed}:${index}`) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash;
}

function getHashedFallback(spot: SpotImageInput): string {
  const category = categoryKey(spot.category);
  const variants = SPOT_IMAGE_FALLBACK_VARIANTS[category] ?? SPOT_IMAGE_FALLBACK_VARIANTS.spot;
  const seed = spotSeed(spot);
  if (!seed || variants.length <= 1) return variants[0] ?? getSpotImageFallback(category);
  const index = typeof spot.index === 'number' && Number.isFinite(spot.index) ? spot.index : 0;
  return variants[hashSpotSeed(seed, index) % variants.length] ?? variants[0] ?? getSpotImageFallback(category);
}

export type SpotImageResolution = {
  url: string;
  photoReference: string | null;
};

const dynamicPhotoCache = new Map<string, Promise<SpotImageResolution | null>>();

export function clearSpotImageResolutionCache() {
  dynamicPhotoCache.clear();
}

function dynamicPhotoKey(spot: SpotImageInput): string | null {
  const placeId = nonEmpty(spot.placeId) ?? nonEmpty(spot.googlePlaceId) ?? nonEmpty(spot.google_place_id);
  if (placeId) return `id:${placeId}`;
  // Address-based lookup is intentionally opt-in: querying every free-form
  // title would spend Places quota for entries that have no useful location.
  const address = nonEmpty(spot.address);
  if (!address) return null;
  const query = [nonEmpty(spot.name), nonEmpty(spot.location_name), address].filter(Boolean).join(' ');
  return query ? `query:${query.toLocaleLowerCase('zh-Hant')}` : null;
}

/**
 * Resolve a photo for existing rows that only have a place id/address. The
 * request is cached per place/query to avoid one API call per re-render.
 */
export async function resolveSpotImage(spot: SpotImageInput | null | undefined, apiKey?: string): Promise<SpotImageResolution> {
  const fallback = { url: getSpotImageUrl(spot), photoReference: null } satisfies SpotImageResolution;
  if (!spot) return fallback;
  const reference = nonEmpty(spot.photoReference) ?? nonEmpty(spot.photo_reference);
  const directUrl = reference ? getGooglePhotoUrl(reference, apiKey) : null;
  if (directUrl) return { url: directUrl, photoReference: reference };

  const key = getGooglePhotoApiKey(apiKey);
  const cacheKey = dynamicPhotoKey(spot);
  if (!key || !cacheKey) return fallback;
  const cached = dynamicPhotoCache.get(cacheKey);
  if (cached) return (await cached) ?? fallback;

  const request = (async (): Promise<SpotImageResolution | null> => {
    try {
      const placeId = nonEmpty(spot.placeId) ?? nonEmpty(spot.googlePlaceId) ?? nonEmpty(spot.google_place_id);
      const place = placeId
        ? await fetchGooglePlaceDetails(placeId, key)
        : (await searchGooglePlacesText([nonEmpty(spot.name), nonEmpty(spot.location_name), nonEmpty(spot.address)].filter(Boolean).join(' '), key))[0];
      const resolvedReference = place?.photoReference;
      const url = resolvedReference ? getGooglePhotoUrl(resolvedReference, key) : null;
      return url ? { url, photoReference: resolvedReference ?? null } : null;
    } catch (error) {
      console.warn('[SpotImage] dynamic photo lookup failed', error);
      return null;
    }
  })();
  dynamicPhotoCache.set(cacheKey, request);
  const resolved = await request;
  return resolved ?? fallback;
}

export async function resolveSpotImageUrl(spot: SpotImageInput | null | undefined, apiKey?: string): Promise<string> {
  return (await resolveSpotImage(spot, apiKey)).url;
}

/**
 * Resolve an itinerary spot to an image URL.
 *
 * Existing uploads/API values always win. For a Google Places photo reference
 * we use the Places Photo endpoint when a public key is configured. If the
 * reference is unavailable or not configured, a curated destination image is
 * preferred, followed by a stable category image. The UI should still handle
 * an image load error with getSpotImageFallbackUrl and finally show its local
 * category icon if every static image is unavailable.
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

  return getHashedFallback(spot);
}
