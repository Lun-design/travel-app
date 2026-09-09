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
