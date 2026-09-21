import { inferTimezoneFromDestination } from './timezone';
import { searchPlaces, type GeocodingResult } from './geocoding';
import { hasGooglePlacesApiKey, searchGooglePlacesTextPage } from './google-places';
import type { ItineraryItemSaveInput } from './itinerary';

export type GlobalPlaceCategory = 'outdoor' | 'indoor' | 'other';

export type GlobalPlaceSearchResult = {
  id: string;
  title: string;
  address: string;
  city: string | null;
  country: string | null;
  countryCode?: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  category: GlobalPlaceCategory;
  estimatedDurationMinutes: number;
  types?: string[];
  imageUrl?: string | null;
  image_url?: string | null;
  photoUrl?: string | null;
  photo_url?: string | null;
  photoReference?: string | null;
  provider?: GeocodingResult['provider'];
  source: GeocodingResult;
};

export type GlobalPlaceSearchProvider = (query: string) => Promise<GeocodingResult[]>;

export type RecommendationRawPage = {
  results: GeocodingResult[];
  nextPageToken?: string | null;
  /** Optional provider total; Google may omit this and rely on page tokens. */
  totalItems?: number | null;
};

export type RecommendationPageProvider = (query: string, pageToken?: string) => Promise<RecommendationRawPage>;

export type RecommendationPage = {
  results: GlobalPlaceSearchResult[];
  nextPageToken: string | null;
  totalItems: number | null;
};

export type RecommendationPageOptions = {
  subcategory?: RecommendationSubcategoryId;
  pageToken?: string | null;
  /** Optional query used when the selected search exhausted its page token. */
  queryOverride?: string;
  provider?: RecommendationPageProvider;
  cache?: RecommendationSessionCache;
};

export type RecommendationSessionCache = {
  getOrFetch: <T>(key: string, fetcher: () => Promise<T>) => Promise<T>;
  clear: () => void;
};

export function createRecommendationSessionCache(): RecommendationSessionCache {
  const entries = new Map<string, Promise<unknown>>();
  return {
    getOrFetch<T>(key: string, fetcher: () => Promise<T>) {
      const cached = entries.get(key) as Promise<T> | undefined;
      if (cached) return cached;
      const request = fetcher().catch((error: unknown) => {
        entries.delete(key);
        throw error;
      });
      entries.set(key, request);
      return request;
    },
    clear() {
      entries.clear();
    },
  };
}

const recommendationSessionCache = createRecommendationSessionCache();

export function clearRecommendationSessionCache() {
  recommendationSessionCache.clear();
}

export function mergeRecommendationResults<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export type RecommendationThemeId = 'must-see' | 'food' | 'indoor' | 'free-time';

export type RecommendationTheme = {
  id: RecommendationThemeId;
  label: string;
  description: string;
};

export const RECOMMENDATION_THEMES: RecommendationTheme[] = [
  { id: 'must-see', label: '必去打卡', description: '第一次到訪也不會錯過的代表景點' },
  { id: 'food', label: '在地美食', description: '把當地味道排進旅程' },
  { id: 'indoor', label: '室內備案', description: '下雨或太熱時的舒適選擇' },
  { id: 'free-time', label: '空檔填補', description: '填補半天空檔的輕鬆去處' },
];

const OUTDOOR_TERMS = [
  '公園', '步道', '海邊', '海灘', '沙灘', '老街', '吊橋', '農場', '露營', '戶外',
  'park', 'garden', 'beach', 'coast', 'trail', 'hike', 'camp', 'farm', 'tower', '鐵塔', 'outdoor',
];
const INDOOR_TERMS = [
  '博物館', '美術館', '水族館', '商場', '百貨', '室內', '羅浮宮', 'museum', 'louvre', 'gallery', 'aquarium', 'mall', 'market', 'indoor',
];

function includesTerm(value: string, terms: string[]) {
  const normalized = value.toLocaleLowerCase('zh-Hant');
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase('zh-Hant')));
}

function parseLocationParts(address: string): { city: string | null; country: string | null } {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { city: null, country: null };
  return {
    city: parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 2] ?? null,
    country: parts[parts.length - 1] ?? null,
  };
}

export function classifyGlobalPlace(input: { title?: string | null; address?: string | null; types?: string[] | null }): GlobalPlaceCategory {
  const value = [input.title, input.address, ...(input.types ?? [])].filter(Boolean).join(' ');
  if (includesTerm(value, INDOOR_TERMS)) return 'indoor';
  if (includesTerm(value, OUTDOOR_TERMS)) return 'outdoor';
  return 'other';
}

export function estimateGlobalPlaceDuration(category: GlobalPlaceCategory, input: { title?: string | null; types?: string[] | null } = {}): number {
  const value = [input.title, ...(input.types ?? [])].filter(Boolean).join(' ');
  if (category === 'indoor' || includesTerm(value, ['museum', 'gallery', '博物館', '美術館'])) return 90;
  if (category === 'outdoor') return includesTerm(value, ['tower', '鐵塔']) ? 60 : 90;
  return 60;
}

export function normalizeGlobalPlace(place: GeocodingResult): GlobalPlaceSearchResult {
  const address = place.displayName?.trim() || place.title.trim();
  const location = parseLocationParts(address);
  const category = classifyGlobalPlace({ title: place.title, address });
  const imageUrl = place.imageUrl ?? place.image_url ?? place.photoUrl ?? place.photo_url ?? null;
  return {
    id: place.id,
    title: place.title.trim(),
    address,
    city: location.city,
    country: location.country,
    countryCode: place.countryCode?.trim().toUpperCase() || null,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: inferTimezoneFromDestination(address),
    category,
    estimatedDurationMinutes: estimateGlobalPlaceDuration(category, { title: place.title }),
    types: place.types,
    imageUrl,
    image_url: imageUrl,
    photoUrl: imageUrl,
    photo_url: imageUrl,
    photoReference: place.photoReference ?? null,
    provider: place.provider,
    source: place,
  };
}

function containsAny(value: string, terms: string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase()));
}

function placeRegionText(place: GlobalPlaceSearchResult): string {
  // Do not include the place title: a title such as "Place Two" contains the
  // country-code substring "tw" but is not evidence that the place is in TW.
  return [place.countryCode, place.country, place.city, place.address, place.source.displayName].filter(Boolean).join(' ');
}

function isJapanPlace(place: GlobalPlaceSearchResult): boolean {
  const text = placeRegionText(place);
  // An explicit Taiwan signal always wins over a Japanese-looking business
  // name (for example, a Japanese cafe on Taipei's Linsen Road).
  if (containsAny(text, ['台灣', '臺灣', 'taiwan', 'taipei', 'tw'])) return false;
  if (containsAny(text, ['日本', 'japan', 'jp'])) return true;
  return place.latitude >= 24 && place.latitude <= 46 && place.longitude >= 122 && place.longitude <= 154;
}

function isOsakaPlace(place: GlobalPlaceSearchResult): boolean {
  if (!isJapanPlace(place)) return false;
  const text = placeRegionText(place);
  if (containsAny(text, ['大阪', 'osaka'])) return true;
  return place.latitude >= 34.2 && place.latitude <= 34.95 && place.longitude >= 134.8 && place.longitude <= 135.95;
}

/** Keep live recommendation results inside the selected destination boundary. */
export function filterGlobalRecommendationsByDestination(
  results: GlobalPlaceSearchResult[],
  destination: string,
): GlobalPlaceSearchResult[] {
  const value = destination.trim();
  if (!value) return results;
  if (containsAny(value, ['大阪', 'osaka'])) return results.filter(isOsakaPlace);
  if (containsAny(value, ['日本', 'japan', 'jp', '東京', 'tokyo', '京都', 'kyoto', '關西', 'kansai'])) {
    return results.filter(isJapanPlace);
  }
  if (containsAny(value, ['台灣', '臺灣', 'taiwan', 'taipei', 'tw'])) {
    return results.filter((place) => containsAny(placeRegionText(place), ['台灣', '臺灣', 'taiwan', 'taipei', 'tw'])
      || (place.latitude >= 21.5 && place.latitude <= 25.5 && place.longitude >= 119 && place.longitude <= 122.2));
  }
  return results;
}

/**
 * Small, curated destination starters shown before a user searches.  These are
 * deliberately stable records (rather than mock API responses) so the first
 * useful cards still render when Places API is unavailable or offline.
 */
export function getCuratedRecommendations(destination: string): GlobalPlaceSearchResult[] {
  const value = destination.trim().toLocaleLowerCase();
  if (!/(日本|jp|japan|大阪|osaka|關西|kansai|京都|kyoto|東京|tokyo)/i.test(value)) return [];

  const entries: Array<{
    id: string;
    title: string;
    address: string;
    latitude: number;
    longitude: number;
    category: GlobalPlaceCategory;
    estimatedDurationMinutes: number;
    imageUrl: string;
  }> = [
    { id: 'curated-dotombori', title: '道頓堀', address: '道頓堀, 大阪府大阪市, 日本', latitude: 34.6687, longitude: 135.5013, category: 'outdoor', estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=640&h=360&fit=crop&auto=format' },
    { id: 'curated-kuromon-market', title: '黑門市場', address: '黑門市場, 大阪府大阪市, 日本', latitude: 34.6654, longitude: 135.5063, category: 'indoor', estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=640&h=360&fit=crop&auto=format' },
    { id: 'curated-osaka-castle-park', title: '大阪城公園', address: '大阪城公園, 大阪府大阪市, 日本', latitude: 34.6873, longitude: 135.5262, category: 'outdoor', estimatedDurationMinutes: 120, imageUrl: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=640&h=360&fit=crop&auto=format' },
    { id: 'curated-okonomiyaki-mizuno', title: '大阪燒美津の', address: '大阪燒美津の, 大阪府大阪市, 日本', latitude: 34.6686, longitude: 135.5034, category: 'indoor', estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  ];

  return entries.map((entry) => {
    const source: GeocodingResult = {
      id: entry.id,
      title: entry.title,
      displayName: entry.address,
      latitude: entry.latitude,
      longitude: entry.longitude,
      provider: 'osm',
    };
    return {
      ...entry,
      city: '大阪',
      country: '日本',
      timezone: 'Asia/Tokyo',
      provider: source.provider,
      source,
    };
  });
}

export async function searchGlobalPlaces(query: string, provider: GlobalPlaceSearchProvider = searchPlaces): Promise<GlobalPlaceSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const results = await provider(normalized);
  return results
    .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
    .map(normalizeGlobalPlace);
}

export const RECOMMENDATION_THEME_QUERY: Record<RecommendationThemeId, string> = {
  'must-see': '必去景點 地標',
  food: '在地美食 餐廳',
  indoor: '室內景點 博物館',
  'free-time': '附近景點 咖啡 空檔',
};

export type RecommendationSubcategoryId = 'all' | 'bbq' | 'hotpot' | 'noodles' | 'izakaya' | 'dessert' | 'landmark' | 'shrine' | 'nature' | 'shopping';
export type RecommendationSubcategory = { id: RecommendationSubcategoryId; label: string; keyword: string };

const RECOMMENDATION_SUBCATEGORIES: Record<RecommendationThemeId, RecommendationSubcategory[]> = {
  food: [
    { id: 'all', label: '全部', keyword: '美食 餐廳' },
    { id: 'bbq', label: '燒肉／烤肉', keyword: '燒肉 烤肉 BBQ' },
    { id: 'hotpot', label: '火鍋', keyword: '火鍋 涮涮鍋 壽喜燒 鍋 鍋物 shabu sukiyaki しゃぶしゃぶ すき焼き' },
    { id: 'noodles', label: '拉麵／麵食', keyword: '拉麵 麵食' },
    { id: 'izakaya', label: '居酒屋／酒吧', keyword: '居酒屋 酒吧' },
    { id: 'dessert', label: '甜點咖啡', keyword: '甜點 咖啡' },
  ],
  'must-see': [
    { id: 'all', label: '全部', keyword: '必去景點 地標' },
    { id: 'landmark', label: '地標／展覽', keyword: '地標 展覽' },
    { id: 'shrine', label: '神社／古蹟', keyword: '神社 古蹟' },
    { id: 'nature', label: '自然／公園', keyword: '自然 公園' },
    { id: 'shopping', label: '購物商圈', keyword: '購物 商圈' },
  ],
  indoor: [{ id: 'all', label: '全部', keyword: '室內景點 博物館' }],
  'free-time': [{ id: 'all', label: '全部', keyword: '附近景點 咖啡 空檔' }],
};

export function getRecommendationSubcategories(theme: RecommendationThemeId): RecommendationSubcategory[] {
  return RECOMMENDATION_SUBCATEGORIES[theme].map((item) => ({ ...item }));
}

export function buildRecommendationQuery(destination: string, theme: RecommendationThemeId, subcategory: RecommendationSubcategoryId = 'all'): string {
  const category = getRecommendationSubcategories(theme).find((item) => item.id === subcategory)
    ?? getRecommendationSubcategories(theme)[0];
  return `${destination.trim()} ${category.keyword}`.trim();
}

const RECOMMENDATION_EXPANSION_TERMS: Partial<Record<RecommendationSubcategoryId, string>> = {
  bbq: '燒肉',
  hotpot: '火鍋',
  noodles: '拉麵',
  izakaya: '居酒屋',
  dessert: '甜點咖啡',
  landmark: '地標',
  shrine: '神社古蹟',
  nature: '自然公園',
  shopping: '購物商圈',
};

const RECOMMENDATION_EXPANSION_PREFIXES = ['熱門', '必吃', '人氣', '推薦', '附近熱門'];

/** Builds a progressively broader query for pages after Places tokens are exhausted. */
export function buildExpandedRecommendationQuery(
  destination: string,
  theme: RecommendationThemeId,
  subcategory: RecommendationSubcategoryId = 'all',
  expansionIndex = 0,
): string {
  const normalizedDestination = destination.trim();
  const baseTerm = RECOMMENDATION_EXPANSION_TERMS[subcategory]
    ?? (theme === 'food' ? '美食' : theme === 'must-see' ? '景點' : theme === 'indoor' ? '室內景點' : '休閒');
  const prefix = RECOMMENDATION_EXPANSION_PREFIXES[Math.max(0, Math.floor(expansionIndex)) % RECOMMENDATION_EXPANSION_PREFIXES.length];
  return `${normalizedDestination} ${prefix}${baseTerm}`.trim();
}

const RECOMMENDATION_SUBCATEGORY_TERMS: Partial<Record<RecommendationSubcategoryId, string[]>> = {
  bbq: ['燒肉', '烤肉', '焼肉', 'bbq', 'yakiniku'],
  hotpot: ['火鍋', '涮涮鍋', '鍋物', 'しゃぶ', 'hotpot', 'hot pot'],
  noodles: ['拉麵', '拉面', '麵食', '麺', 'ラーメン', '麵', '烏龍麵', 'うどん', '蕎麥', 'そば', 'ramen', 'noodle', 'udon', 'soba'],
  izakaya: ['居酒屋', '酒吧', '串燒', 'バル', 'izakaya', 'bar', 'pub'],
  dessert: ['甜點', '咖啡', '蛋糕', '甜品', 'dessert', 'cafe', 'coffee', 'cake'],
  landmark: ['地標', '展覽', '博物館', '塔', 'landmark', 'exhibition', 'museum', 'tower'],
  shrine: ['神社', '古蹟', '寺', '教堂', 'shrine', 'temple', 'historic', 'church'],
  nature: ['自然', '公園', '海邊', '步道', '花園', 'park', 'garden', 'nature', 'trail', 'beach'],
  shopping: ['購物', '商圈', '百貨', '市場', 'shopping', 'mall', 'market', 'department'],
};

/** Keep provider results aligned with the selected deep category. */
export function filterGlobalRecommendationsBySubcategory(
  results: GlobalPlaceSearchResult[],
  theme: RecommendationThemeId,
  subcategory: RecommendationSubcategoryId = 'all',
): GlobalPlaceSearchResult[] {
  if (subcategory === 'all') return results;
  // A subcategory belongs to one theme; ignoring mismatched ids avoids
  // accidentally filtering an unrelated theme with stale UI state.
  const validForTheme = theme === 'food'
    ? ['bbq', 'hotpot', 'noodles', 'izakaya', 'dessert']
    : theme === 'must-see'
      ? ['landmark', 'shrine', 'nature', 'shopping']
      : [];
  if (!validForTheme.includes(subcategory)) return results;
  const terms = RECOMMENDATION_SUBCATEGORY_TERMS[subcategory] ?? [];
  return results.filter((place) => containsAny([
    place.title,
    place.address,
    place.source.title,
    place.source.displayName,
    ...(place.types ?? []),
  ].filter(Boolean).join(' '), terms));
}

export const DEFAULT_RECOMMENDATION_PAGE_SIZE = 6;

export function paginateRecommendations<T>(items: T[], requestedPage: number, pageSize = DEFAULT_RECOMMENDATION_PAGE_SIZE, totalItems?: number | null) {
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_RECOMMENDATION_PAGE_SIZE;
  const normalizedTotal = Number.isFinite(totalItems) && (totalItems as number) >= 0
    ? Math.max(items.length, Math.floor(totalItems as number))
    : items.length;
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / safeSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  return {
    page,
    totalPages,
    items: items.slice((page - 1) * safeSize, page * safeSize),
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

async function defaultRecommendationPageProvider(query: string, pageToken?: string): Promise<RecommendationRawPage> {
  if (hasGooglePlacesApiKey()) {
    try {
      const page = await searchGooglePlacesTextPage(query, undefined, pageToken);
      if (page.results.length || pageToken) return page;
    } catch (error) {
      console.error('[recommendations] Google Text Search unavailable; falling back to geocoding', error);
      if (pageToken) return { results: [], nextPageToken: null };
    }
  }
  if (pageToken) return { results: [], nextPageToken: null };
  return { results: await searchPlaces(query), nextPageToken: null };
}

function normalizeRecommendationResults(
  results: GeocodingResult[],
  destination: string,
  theme: RecommendationThemeId,
  subcategory: RecommendationSubcategoryId,
): GlobalPlaceSearchResult[] {
  return filterGlobalRecommendationsBySubcategory(
    filterGlobalRecommendationsByDestination(
      results.filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude)).map(normalizeGlobalPlace),
      destination,
    ),
    theme,
    subcategory,
  );
}

export async function searchDynamicRecommendationsPage(
  destination: string,
  theme: RecommendationThemeId,
  options: RecommendationPageOptions = {},
): Promise<RecommendationPage> {
  const normalizedDestination = destination.trim();
  if (normalizedDestination.length < 2) return { results: [], nextPageToken: null, totalItems: 0 };
  const query = options.queryOverride?.trim()
    || buildRecommendationQuery(normalizedDestination, theme, options.subcategory ?? 'all');
  const pageToken = options.pageToken?.trim() || '';
  const cache = options.cache ?? recommendationSessionCache;
  const provider = options.provider ?? defaultRecommendationPageProvider;
  return cache.getOrFetch(`${query}|${pageToken}`, async () => {
    const raw = await provider(query, pageToken || undefined);
    const subcategory = options.subcategory ?? 'all';
    let results = normalizeRecommendationResults(raw.results, normalizedDestination, theme, subcategory);
    let nextPageToken = raw.nextPageToken?.trim() || null;
    let totalItems = Number.isFinite(raw.totalItems) ? Math.max(0, Math.floor(raw.totalItems as number)) : null;

    // Once the selected provider page is exhausted, broaden the query so a
    // sparse deep category still gives the traveler a useful set of cards.
    const shouldBroaden = subcategory !== 'all'
      && !pageToken
      && !options.queryOverride?.trim()
      && results.length < 3
      // For the real Places provider broaden immediately; injected providers
      // with a next token can continue pagination without duplicate requests.
      && (!nextPageToken || provider === defaultRecommendationPageProvider);
    if (shouldBroaden) {
      const broadQuery = buildRecommendationQuery(normalizedDestination, theme, 'all');
      if (broadQuery !== query) {
        const broadRaw = await provider(broadQuery);
        const broadResults = normalizeRecommendationResults(broadRaw.results, normalizedDestination, theme, 'all');
        const strictBroadResults = normalizeRecommendationResults(broadRaw.results, normalizedDestination, theme, subcategory);
        const strictMerged = mergeRecommendationResults(results, strictBroadResults);
        results = strictMerged.length >= 3 ? strictMerged : mergeRecommendationResults(strictMerged, broadResults);
        nextPageToken = nextPageToken ?? broadRaw.nextPageToken?.trim() ?? null;
        totalItems = totalItems ?? (Number.isFinite(broadRaw.totalItems) ? Math.max(0, Math.floor(broadRaw.totalItems as number)) : null);
      }
    }

    return { results, nextPageToken, totalItems };
  });
}

/** Fetches live recommendations for the selected destination and theme. */
export async function searchDynamicRecommendations(
  destination: string,
  theme: RecommendationThemeId,
  provider: GlobalPlaceSearchProvider = searchPlaces,
  subcategory: RecommendationSubcategoryId = 'all',
): Promise<GlobalPlaceSearchResult[]> {
  const normalizedDestination = destination.trim();
  if (normalizedDestination.length < 2) return [];
  const query = buildRecommendationQuery(normalizedDestination, theme, subcategory);
  if (provider !== searchPlaces) {
    const results = await searchGlobalPlaces(query, provider);
    return filterGlobalRecommendationsBySubcategory(
      filterGlobalRecommendationsByDestination(results, normalizedDestination),
      theme,
      subcategory,
    );
  }
  return (await searchDynamicRecommendationsPage(normalizedDestination, theme, { subcategory })).results;
}

export type GlobalItineraryPayload = ItineraryItemSaveInput & { timezone: string };

export function buildGlobalItineraryPayload(place: GlobalPlaceSearchResult, options: {
  tripId: string;
  createdBy: string;
  dayNumber: number;
  startTime?: string | null;
  position?: number;
  durationMinutes?: number | null;
}): GlobalItineraryPayload {
  return {
    trip_id: options.tripId,
    day_number: Math.max(1, Math.trunc(options.dayNumber)),
    position: options.position ?? 0,
    time: options.startTime?.trim() || null,
    location_name: place.title,
    address: place.address || null,
    latitude: place.latitude,
    longitude: place.longitude,
    notes: null,
    category: place.category,
    duration_minutes: options.durationMinutes ?? place.estimatedDurationMinutes,
    created_by: options.createdBy,
    timezone: place.timezone,
  };
}
