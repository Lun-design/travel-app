import { inferTimezoneFromDestination } from './timezone';
import { searchPlaces, type GeocodingResult } from './geocoding';
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

export type PresetPlace = GlobalPlaceSearchResult & {
  dayNumber: number;
  suggestedStartTime: string;
};

export type RecommendationPreset = {
  id: string;
  destination: string;
  title: string;
  description: string;
  durationLabel: string;
  places: PresetPlace[];
};

const OUTDOOR_TERMS = [
  '公園', '步道', '海邊', '海灘', '沙灘', '老街', '吊橋', '農場', '露營', '戶外',
  'park', 'garden', 'beach', 'coast', 'trail', 'hike', 'camp', 'farm', 'tower', '鐵塔', 'outdoor',
];
const INDOOR_TERMS = [
  '博物館', '美術館', '水族館', '商場', '百貨', '室內', '羅浮宮', 'museum', 'louvre', 'gallery', 'aquarium', 'mall', 'market', 'indoor',
];

type PresetPlaceSeed = {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  category: GlobalPlaceCategory;
  duration: number;
  timezone: string;
  dayNumber?: number;
  suggestedStartTime?: string;
};

const DESTINATION_ALIASES: Record<string, string[]> = {
  tokyo: ['東京', 'tokyo', '日本', 'japan'],
  seoul: ['首爾', 'seoul', '韓國', 'korea'],
  paris: ['巴黎', 'paris', '法國', 'france'],
};

const PRESET_SEEDS: Record<string, PresetPlaceSeed[]> = {
  tokyo: [
    { id: 'tokyo-sensoji', title: '淺草寺', address: '淺草寺, 台東區, 東京, 日本', latitude: 35.7148, longitude: 139.7967, category: 'outdoor', duration: 90, timezone: 'Asia/Tokyo', dayNumber: 1, suggestedStartTime: '09:30' },
    { id: 'tokyo-shibuya', title: '澀谷十字路口', address: '澀谷十字路口, 澀谷區, 東京, 日本', latitude: 35.6595, longitude: 139.7005, category: 'outdoor', duration: 60, timezone: 'Asia/Tokyo', dayNumber: 1, suggestedStartTime: '14:00' },
    { id: 'tokyo-tsukiji', title: '築地場外市場', address: '築地場外市場, 中央區, 東京, 日本', latitude: 35.6654, longitude: 139.7707, category: 'other', duration: 90, timezone: 'Asia/Tokyo', dayNumber: 2, suggestedStartTime: '10:00' },
    { id: 'tokyo-teamlab', title: 'teamLab Borderless', address: 'teamLab Borderless, 麻布台, 東京, 日本', latitude: 35.6628, longitude: 139.7384, category: 'indoor', duration: 120, timezone: 'Asia/Tokyo', dayNumber: 2, suggestedStartTime: '15:00' },
  ],
  seoul: [
    { id: 'seoul-gyeongbokgung', title: '景福宮', address: '景福宮, 鐘路區, 首爾, 韓國', latitude: 37.5796, longitude: 126.9770, category: 'outdoor', duration: 90, timezone: 'Asia/Seoul', dayNumber: 1, suggestedStartTime: '09:30' },
    { id: 'seoul-myeongdong', title: '明洞商圈', address: '明洞, 中區, 首爾, 韓國', latitude: 37.5636, longitude: 126.9850, category: 'other', duration: 120, timezone: 'Asia/Seoul', dayNumber: 1, suggestedStartTime: '14:00' },
    { id: 'seoul-gwangjang', title: '廣藏市場', address: '廣藏市場, 鐘路區, 首爾, 韓國', latitude: 37.5700, longitude: 126.9997, category: 'other', duration: 90, timezone: 'Asia/Seoul', dayNumber: 2, suggestedStartTime: '11:00' },
    { id: 'seoul-coex', title: 'COEX 水族館', address: 'COEX 水族館, 江南區, 首爾, 韓國', latitude: 37.5131, longitude: 127.0586, category: 'indoor', duration: 120, timezone: 'Asia/Seoul', dayNumber: 2, suggestedStartTime: '15:00' },
  ],
  paris: [
    { id: 'paris-louvre', title: '羅浮宮', address: '羅浮宮, 巴黎, 法國', latitude: 48.8606, longitude: 2.3376, category: 'indoor', duration: 120, timezone: 'Europe/Paris', dayNumber: 1, suggestedStartTime: '09:30' },
    { id: 'paris-eiffel', title: '艾菲爾鐵塔', address: '艾菲爾鐵塔, 巴黎, 法國', latitude: 48.8584, longitude: 2.2945, category: 'outdoor', duration: 90, timezone: 'Europe/Paris', dayNumber: 1, suggestedStartTime: '15:00' },
    { id: 'paris-montmartre', title: '蒙馬特', address: '蒙馬特, 巴黎, 法國', latitude: 48.8867, longitude: 2.3431, category: 'outdoor', duration: 120, timezone: 'Europe/Paris', dayNumber: 2, suggestedStartTime: '10:00' },
    { id: 'paris-orsay', title: '奧賽博物館', address: '奧賽博物館, 巴黎, 法國', latitude: 48.86, longitude: 2.3266, category: 'indoor', duration: 120, timezone: 'Europe/Paris', dayNumber: 2, suggestedStartTime: '15:00' },
  ],
};

const DEFAULT_THEME_SEEDS: Record<RecommendationThemeId, PresetPlaceSeed[]> = {
  'must-see': [
    { id: 'default-tokyo-tower', title: '東京鐵塔', address: '東京鐵塔, 港區, 東京, 日本', latitude: 35.6586, longitude: 139.7454, category: 'outdoor', duration: 60, timezone: 'Asia/Tokyo' },
    { id: 'default-louvre', title: '羅浮宮', address: '羅浮宮, 巴黎, 法國', latitude: 48.8606, longitude: 2.3376, category: 'indoor', duration: 120, timezone: 'Europe/Paris' },
  ],
  food: [
    { id: 'default-tsukiji', title: '築地場外市場', address: '築地場外市場, 東京, 日本', latitude: 35.6654, longitude: 139.7707, category: 'other', duration: 90, timezone: 'Asia/Tokyo' },
  ],
  indoor: [
    { id: 'default-teamlab', title: 'teamLab Borderless', address: 'teamLab Borderless, 東京, 日本', latitude: 35.6628, longitude: 139.7384, category: 'indoor', duration: 120, timezone: 'Asia/Tokyo' },
  ],
  'free-time': [
    { id: 'default-shibuya', title: '澀谷十字路口', address: '澀谷十字路口, 東京, 日本', latitude: 35.6595, longitude: 139.7005, category: 'outdoor', duration: 60, timezone: 'Asia/Tokyo' },
  ],
};

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

function destinationKey(destination: string): string | null {
  const value = destination.trim().toLocaleLowerCase('zh-Hant');
  return Object.entries(DESTINATION_ALIASES).find(([, aliases]) => aliases.some((alias) => value.includes(alias.toLocaleLowerCase('zh-Hant'))))?.[0] ?? null;
}

function seedToPlace(seed: PresetPlaceSeed): PresetPlace {
  const source: GeocodingResult = {
    id: seed.id,
    title: seed.title,
    displayName: seed.address,
    latitude: seed.latitude,
    longitude: seed.longitude,
    provider: 'osm',
  };
  const parsed = normalizeGlobalPlace(source);
  return {
    ...parsed,
    category: seed.category,
    estimatedDurationMinutes: seed.duration,
    timezone: seed.timezone,
    dayNumber: seed.dayNumber ?? 1,
    suggestedStartTime: seed.suggestedStartTime ?? '10:00',
  };
}

function clonePlace(place: PresetPlace): PresetPlace {
  return { ...place, source: { ...place.source } };
}

export function getPresetItineraries(destination: string): RecommendationPreset[] {
  const key = destinationKey(destination);
  if (!key) return [];
  const places = PRESET_SEEDS[key].map(seedToPlace);
  return [{
    id: `${key}-classic-3d2n`,
    destination: key,
    title: `${key === 'tokyo' ? '東京' : key === 'seoul' ? '首爾' : '巴黎'} 3 天 2 夜經典路線`,
    description: '經典地標搭配美食與室內備案，第一次旅行也能直接套用。',
    durationLabel: '3 天 2 夜',
    places: places.map(clonePlace),
  }];
}

export function getCuratedRecommendations(destination: string, theme: RecommendationThemeId): PresetPlace[] {
  const key = destinationKey(destination);
  const source = key ? PRESET_SEEDS[key].map(seedToPlace) : DEFAULT_THEME_SEEDS[theme].map(seedToPlace);
  const filtered = key
    ? source.filter((place) => {
      if (theme === 'indoor') return place.category === 'indoor';
      if (theme === 'food') return /市場|美食|market|food/i.test(place.title);
      if (theme === 'free-time') return place.category !== 'indoor';
      return true;
    })
    : source;
  return (filtered.length ? filtered : source).map(clonePlace);
}

export function buildPresetItineraryPayloads(preset: RecommendationPreset, options: { tripId: string; createdBy: string }): GlobalItineraryPayload[] {
  return preset.places.map((place) => buildGlobalItineraryPayload(place, {
    tripId: options.tripId,
    createdBy: options.createdBy,
    dayNumber: place.dayNumber,
    startTime: place.suggestedStartTime,
    durationMinutes: place.estimatedDurationMinutes,
  }));
}
