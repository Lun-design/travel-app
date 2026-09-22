import { inferTimezoneFromDestination } from './timezone';
import { searchPlaces, type GeocodingResult } from './geocoding';
import { hasGooglePlacesApiKey, searchGooglePlacesTextPage } from './google-places';
import { isPlacesAuthBlocked } from './places-auth-guard';
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
  subcategory?: RecommendationSubcategoryId;
  subCategories?: RecommendationSubcategoryId[];
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
  source?: 'api' | 'seed';
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
  if (!/(日本|jp|japan|大阪|osaka|關西|kansai)/i.test(value)) return [];

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

type StaticRecommendationSeed = {
  id: string;
  destinations: ('osaka' | 'tokyo')[];
  theme: RecommendationThemeId;
  subcategory: RecommendationSubcategoryId;
  subCategories?: RecommendationSubcategoryId[];
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedDurationMinutes: number;
  imageUrl: string;
};

/** Verified, human-curated places used only when live providers are offline. */
const STATIC_RECOMMENDATION_SEEDS: StaticRecommendationSeed[] = [
  { id: 'seed-osaka-ichiran-dotonbori', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: '一蘭 道頓堀店', address: '大阪府大阪市中央区宗右衛門町7-18', latitude: 34.6687, longitude: 135.5013, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-dotonbori-imai', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: '道頓堀 今井 本店', address: '大阪府大阪市中央区道頓堀1-7-22', latitude: 34.6681, longitude: 135.5022, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-menya-juroku', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: '麺屋 丈六', address: '大阪府大阪市中央区難波千日前6-16', latitude: 34.6635, longitude: 135.5056, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-tsurutontan', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: 'つるとんたん 宗右衛門町店', address: '大阪府大阪市中央区宗右衛門町3-17', latitude: 34.6690, longitude: 135.5024, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-kinryu', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: '金龍ラーメン 道頓堀店', address: '大阪府大阪市中央区道頓堀1-7-26', latitude: 34.6684, longitude: 135.5020, estimatedDurationMinutes: 45, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-rikuro', destinations: ['osaka'], theme: 'food', subcategory: 'noodles', title: 'うどん き田たけうどん', address: '大阪府大阪市浪速区難波中2-4-17', latitude: 34.6615, longitude: 135.5030, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-kisoji', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: '木曽路 道頓堀店', address: '大阪府大阪市中央区宗右衛門町3-17', latitude: 34.6691, longitude: 135.5026, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-onyasai-namba', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: 'しゃぶしゃぶ温野菜 なんば店', address: '大阪府大阪市中央区難波3-4-16', latitude: 34.6661, longitude: 135.5015, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-dontei', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: 'しゃぶしゃぶ どん亭', address: '大阪府大阪市中央区難波3-1-28', latitude: 34.6667, longitude: 135.5011, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-shabutei', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: 'しゃぶ亭 なんば千日前店', address: '大阪府大阪市中央区難波3-4-16', latitude: 34.6660, longitude: 135.5020, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-kagonoya', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: 'かごの屋 大国町店', address: '大阪府大阪市浪速区敷津東2-1-24', latitude: 34.6558, longitude: 135.4991, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-tajimaya', destinations: ['osaka'], theme: 'food', subcategory: 'hotpot', title: '但馬屋 ヨドバシ梅田店', address: '大阪府大阪市北区大深町1-1', latitude: 34.7054, longitude: 135.4958, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-jojoen-lucua', destinations: ['osaka'], theme: 'food', subcategory: 'bbq', title: '叙々苑 ルクア大阪店', address: '大阪府大阪市北区梅田3-1-3', latitude: 34.7025, longitude: 135.4959, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-osaka-castle', destinations: ['osaka'], theme: 'must-see', subcategory: 'landmark', title: '大阪城天守閣', address: '大阪府大阪市中央区大阪城1-1', latitude: 34.6873, longitude: 135.5262, estimatedDurationMinutes: 120, imageUrl: 'https://images.unsplash.com/photo-1590253230532-a67f6bc61d9e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-kuromon', destinations: ['osaka'], theme: 'must-see', subcategory: 'shopping', title: '黒門市場', address: '大阪府大阪市中央区日本橋2-4-1', latitude: 34.6654, longitude: 135.5063, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-osaka-kaiyukan', destinations: ['osaka'], theme: 'must-see', subcategory: 'landmark', title: '海遊館', address: '大阪府大阪市港区海岸通1-1-10', latitude: 34.6545, longitude: 135.4289, estimatedDurationMinutes: 150, imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-ichiran-shinjuku', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: '一蘭 新宿中央東口店', address: '東京都新宿区新宿3-34-11', latitude: 35.6913, longitude: 139.7039, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-afuri', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: 'AFURI 原宿店', address: '東京都渋谷区千駄ヶ谷3-63-1', latitude: 35.6718, longitude: 139.7052, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-tsujihan', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: 'つるとんたん 銀座東急プラザ店', address: '東京都中央区銀座5-2-1', latitude: 35.6721, longitude: 139.7635, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-nakiryu', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: '創作麺工房 鳴龍', address: '東京都豊島区南大塚2-34-4', latitude: 35.7263, longitude: 139.7297, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-kikanbo', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: '鬼金棒 神田本店', address: '東京都千代田区鍛冶町2-10-9', latitude: 35.6928, longitude: 139.7727, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-hachigo', destinations: ['tokyo'], theme: 'food', subcategory: 'noodles', title: '銀座 八五', address: '東京都中央区銀座3-14-2', latitude: 35.6695, longitude: 139.7709, estimatedDurationMinutes: 60, imageUrl: 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-kisoji', destinations: ['tokyo'], theme: 'food', subcategory: 'hotpot', title: '木曽路 新宿三丁目店', address: '東京都新宿区新宿3-17-5', latitude: 35.6914, longitude: 139.7056, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-onyasai', destinations: ['tokyo'], theme: 'food', subcategory: 'hotpot', title: 'しゃぶしゃぶ温野菜 新宿店', address: '東京都新宿区新宿3-20-8', latitude: 35.6918, longitude: 139.7045, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-shabutei', destinations: ['tokyo'], theme: 'food', subcategory: 'hotpot', title: 'しゃぶ亭 新宿店', address: '東京都新宿区新宿3-17-5', latitude: 35.6916, longitude: 139.7051, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-kagonoya', destinations: ['tokyo'], theme: 'food', subcategory: 'hotpot', title: 'かごの屋 石神井公園店', address: '東京都練馬区石神井町3-24-9', latitude: 35.7437, longitude: 139.6062, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-tajimaya', destinations: ['tokyo'], theme: 'food', subcategory: 'hotpot', title: '但馬屋 ヨドバシAKIBA店', address: '東京都千代田区神田花岡町1-1', latitude: 35.6984, longitude: 139.7731, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-jojoen', destinations: ['tokyo'], theme: 'food', subcategory: 'bbq', title: '叙々苑 游玄亭 新宿店', address: '東京都新宿区歌舞伎町1-10-7', latitude: 35.6944, longitude: 139.7021, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-tower', destinations: ['tokyo'], theme: 'must-see', subcategory: 'landmark', title: '東京タワー', address: '東京都港区芝公園4-2-8', latitude: 35.6586, longitude: 139.7454, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=640&h=360&fit=crop&auto=format' },
  { id: 'seed-tokyo-shibuya-sky', destinations: ['tokyo'], theme: 'must-see', subcategory: 'landmark', title: 'SHIBUYA SKY', address: '東京都渋谷区渋谷2-24-12', latitude: 35.6580, longitude: 139.7016, estimatedDurationMinutes: 90, imageUrl: 'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=640&h=360&fit=crop&auto=format' },
];

function staticSeedMatchesDestination(seed: StaticRecommendationSeed, destination: string): boolean {
  const value = destination.toLocaleLowerCase();
  if (value.includes('大阪') || value.includes('osaka')) return seed.destinations.includes('osaka');
  if (value.includes('東京') || value.includes('tokyo')) return seed.destinations.includes('tokyo');
  if (value.includes('日本') || value.includes('japan') || value.includes('jp')) return true;
  return false;
}

function normalizeStaticSeed(seed: StaticRecommendationSeed): GlobalPlaceSearchResult {
  const source: GeocodingResult = {
    id: seed.id,
    title: seed.title,
    displayName: seed.address,
    latitude: seed.latitude,
    longitude: seed.longitude,
    provider: 'osm',
    types: seed.theme === 'food' ? ['restaurant'] : ['tourist_attraction'],
    imageUrl: seed.imageUrl,
  };
  return {
    id: seed.id,
    title: seed.title,
    address: seed.address,
    city: seed.destinations[0] === 'osaka' ? '大阪' : '東京',
    country: '日本',
    countryCode: 'JP',
    latitude: seed.latitude,
    longitude: seed.longitude,
    timezone: 'Asia/Tokyo',
    category: seed.theme === 'food' ? 'indoor' : 'outdoor',
    subcategory: seed.subcategory,
    subCategories: seed.subCategories ?? [seed.subcategory],
    estimatedDurationMinutes: seed.estimatedDurationMinutes,
    imageUrl: seed.imageUrl,
    image_url: seed.imageUrl,
    photoUrl: seed.imageUrl,
    photo_url: seed.imageUrl,
    provider: 'osm',
    source,
  };
}

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
  return results.filter((place) => place.subcategory === subcategory || containsAny([
    place.title,
    place.address,
    place.source.title,
    place.source.displayName,
    ...(place.types ?? []),
  ].filter(Boolean).join(' '), terms));
}

const LOCAL_FALLBACK_COORDINATES: Array<{ terms: string[]; latitude: number; longitude: number }> = [
  { terms: ['大阪', 'osaka'], latitude: 34.6937, longitude: 135.5023 },
  { terms: ['東京', 'tokyo'], latitude: 35.6762, longitude: 139.6503 },
  { terms: ['京都', 'kyoto'], latitude: 35.0116, longitude: 135.7681 },
  { terms: ['台北', 'taipei'], latitude: 25.033, longitude: 121.5654 },
  { terms: ['首爾', 'seoul'], latitude: 37.5665, longitude: 126.978 },
  { terms: ['巴黎', 'paris'], latitude: 48.8566, longitude: 2.3522 },
  { terms: ['紐約', 'new york', 'newyork'], latitude: 40.7128, longitude: -74.006 },
];

const LOCAL_FALLBACK_THEME_LABELS: Record<RecommendationThemeId, string[]> = {
  'must-see': ['熱門地標', '歷史街區', '城市公園', '觀景台', '文化展館', '老街散策', '城市天際線', '經典建築'],
  food: ['在地餐廳', '市場美食', '人氣拉麵店', '咖啡甜點', '家庭料理餐廳', '夜間美食街', '特色小吃店', '高評價餐館'],
  indoor: ['博物館', '水族館', '購物中心', '室內展覽', '美術館', '室內遊樂場', '手作體驗館', '文化中心'],
  'free-time': ['特色街區', '河岸散步', '咖啡休息', '商圈漫遊', '城市書店', '在地市集', '夕陽景點', '休閒公園'],
};

const LOCAL_FALLBACK_SUBCATEGORY_LABELS: Partial<Record<RecommendationSubcategoryId, string[]>> = {
  bbq: ['炭火燒肉名店', '在地和牛燒肉', '人氣烤肉餐廳', '家庭式燒肉店', '高評價燒肉食堂'],
  hotpot: ['在地火鍋名店', '涮涮鍋餐廳', '壽喜燒專門店', '人氣鍋物食堂', '季節鍋料理'],
  noodles: ['人氣拉麵店', '麵屋名店', '在地麵食堂', '豚骨拉麵專門店', '烏龍麵老店'],
  izakaya: ['人氣居酒屋', '在地酒場', '串燒居酒屋', '深夜小酒館', '日式下酒菜店'],
  dessert: ['日式甜點店', '咖啡甜點名店', '抹茶茶屋', '手作蛋糕店', '人氣咖啡館'],
  landmark: ['城市地標', '人氣展覽館', '經典觀景台', '歷史建築', '必訪文化景點'],
  shrine: ['知名神社', '古蹟寺院', '在地歷史景點', '傳統建築', '人氣參拜景點'],
  nature: ['城市公園', '自然步道', '河岸景觀', '綠意庭園', '戶外休閒景點'],
  shopping: ['熱門購物商圈', '百貨商場', '在地市場', '特色商店街', '人氣購物中心'],
};

/** Stable seed cards used when Places/Nominatim is unavailable or returns no data. */
export function getLocalRecommendationFallback(
  destination: string,
  theme: RecommendationThemeId,
  subcategory: RecommendationSubcategoryId = 'all',
): GlobalPlaceSearchResult[] {
  const destinationSeeds = STATIC_RECOMMENDATION_SEEDS
    .filter((seed) => staticSeedMatchesDestination(seed, destination));
  const strictSeeds = destinationSeeds
    .filter((seed) => seed.theme === theme)
    .filter((seed) => subcategory === 'all' || (seed.subCategories ?? [seed.subcategory]).includes(subcategory));
  const fallbackSeeds = [...strictSeeds];
  // Never pad a deep category with another deep category (for example,
  // noodles must not appear in a hotpot result). Generic same-destination
  // padding is only allowed for the unfiltered theme view.
  if (subcategory === 'all' && fallbackSeeds.length < 6) {
    for (const seed of destinationSeeds) {
      if (!fallbackSeeds.some((item) => item.id === seed.id)) fallbackSeeds.push(seed);
      if (fallbackSeeds.length >= 6) break;
    }
  }
  return fallbackSeeds.map(normalizeStaticSeed);

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
  if (isPlacesAuthBlocked()) return { results: [], nextPageToken: null };
  if (hasGooglePlacesApiKey()) {
    try {
      const page = await searchGooglePlacesTextPage(query, undefined, pageToken);
      if (page.results.length || pageToken) return page;
      if (isPlacesAuthBlocked()) return { results: [], nextPageToken: null };
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
  if (normalizedDestination.length < 2) return { results: [], nextPageToken: null, totalItems: 0, source: 'api' };
  const query = options.queryOverride?.trim()
    || buildRecommendationQuery(normalizedDestination, theme, options.subcategory ?? 'all');
  const pageToken = options.pageToken?.trim() || '';
  const cache = options.cache ?? recommendationSessionCache;
  const provider = options.provider ?? defaultRecommendationPageProvider;
  return cache.getOrFetch(`${query}|${pageToken}`, async () => {
    const subcategory = options.subcategory ?? 'all';
    let raw: RecommendationRawPage;
    try {
      raw = await provider(query, pageToken || undefined);
    } catch (error) {
      // A failed first-page request should never blank the recommendation UI.
      // Keep pagination-token failures empty so we do not duplicate page one.
      if (pageToken) {
        console.error('[recommendations] page request failed', error);
        return { results: [], nextPageToken: null, totalItems: null, source: 'api' };
      }
      console.error('[recommendations] provider failed; using local fallback', error);
      return {
        results: getLocalRecommendationFallback(normalizedDestination, theme, subcategory),
        nextPageToken: null,
        totalItems: null,
        source: 'seed',
      };
    }
    let source: 'api' | 'seed' = 'api';
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

    if (!results.length && !pageToken) {
      results = getLocalRecommendationFallback(normalizedDestination, theme, subcategory);
      source = 'seed';
    }

    return { results, nextPageToken, totalItems, source };
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
