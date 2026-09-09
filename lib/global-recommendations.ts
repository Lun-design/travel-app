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
  latitude: number;
  longitude: number;
  timezone: string;
  category: GlobalPlaceCategory;
  estimatedDurationMinutes: number;
  provider?: GeocodingResult['provider'];
  source: GeocodingResult;
};

export type GlobalPlaceSearchProvider = (query: string) => Promise<GeocodingResult[]>;

export type RecommendationRawPage = {
  results: GeocodingResult[];
  nextPageToken?: string | null;
};

export type RecommendationPageProvider = (query: string, pageToken?: string) => Promise<RecommendationRawPage>;

export type RecommendationPage = {
  results: GlobalPlaceSearchResult[];
  nextPageToken: string | null;
};

export type RecommendationPageOptions = {
  subcategory?: RecommendationSubcategoryId;
  pageToken?: string | null;
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
  return {
    id: place.id,
    title: place.title.trim(),
    address,
    city: location.city,
    country: location.country,
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: inferTimezoneFromDestination(address),
    category,
    estimatedDurationMinutes: estimateGlobalPlaceDuration(category, { title: place.title }),
    provider: place.provider,
    source: place,
  };
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
    { id: 'hotpot', label: '火鍋', keyword: '火鍋 涮涮鍋' },
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

export function paginateRecommendations<T>(items: T[], requestedPage: number, pageSize = 6) {
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 6;
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
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
      console.warn('[recommendations] Google Text Search unavailable; falling back to geocoding', error);
      if (pageToken) return { results: [], nextPageToken: null };
    }
  }
  if (pageToken) return { results: [], nextPageToken: null };
  return { results: await searchPlaces(query), nextPageToken: null };
}

export async function searchDynamicRecommendationsPage(
  destination: string,
  theme: RecommendationThemeId,
  options: RecommendationPageOptions = {},
): Promise<RecommendationPage> {
  const normalizedDestination = destination.trim();
  if (normalizedDestination.length < 2) return { results: [], nextPageToken: null };
  const query = buildRecommendationQuery(normalizedDestination, theme, options.subcategory ?? 'all');
  const pageToken = options.pageToken?.trim() || '';
  const cache = options.cache ?? recommendationSessionCache;
  const provider = options.provider ?? defaultRecommendationPageProvider;
  return cache.getOrFetch(`${query}|${pageToken}`, async () => {
    const raw = await provider(query, pageToken || undefined);
    return {
      results: raw.results
        .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
        .map(normalizeGlobalPlace),
      nextPageToken: raw.nextPageToken?.trim() || null,
    };
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
  if (provider !== searchPlaces) return searchGlobalPlaces(query, provider);
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
