import type { OpeningHours, Weekday } from './itinerary';
import { hasGooglePlacesApiKey, searchGooglePlaces } from './google-places';

export type GeocodingResult = {
  id: string;
  title: string;
  displayName: string;
  latitude: number;
  longitude: number;
  openingHours?: OpeningHours | null;
  provider?: 'osm' | 'google';
  googlePlaceId?: string;
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
};

type NominatimResult = {
  place_id: number | string;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  extratags?: { opening_hours?: string };
  osm_type?: string;
  osm_id?: number | string;
};
type GeocodingSearch = (query: string) => Promise<GeocodingResult[]>;

const PUBLIC_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const configuredEndpoint = (process.env.EXPO_PUBLIC_NOMINATIM_URL || PUBLIC_NOMINATIM_URL).replace(/\/$/, '');
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;

export function normalizeGeocodingQuery(query: string) {
  return query.trim().replace(/\s+/g, ' ');
}

const osmDayNames: Record<string, Weekday> = {
  mo: 'monday', tu: 'tuesday', we: 'wednesday', th: 'thursday', fr: 'friday', sa: 'saturday', su: 'sunday',
};
const orderedWeekdays: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function parseOsmDays(value: string): Weekday[] {
  const days = value.split(',').flatMap((part) => {
    const range = part.trim().toLowerCase().split('-');
    const start = osmDayNames[range[0]];
    const end = osmDayNames[range[range.length - 1]];
    if (!start || !end) return [];
    const startIndex = orderedWeekdays.indexOf(start);
    const endIndex = orderedWeekdays.indexOf(end);
    if (range.length === 1) return [start];
    return orderedWeekdays.filter((_, index) => startIndex <= endIndex ? index >= startIndex && index <= endIndex : index >= startIndex || index <= endIndex);
  });
  return [...new Set(days)];
}

function normalizeOsmTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function parseOsmOpeningHours(value: string | null | undefined): OpeningHours | null {
  if (!value?.trim()) return null;
  if (value.trim().toLowerCase() === '24/7') {
    return Object.fromEntries(orderedWeekdays.map((day) => [day, { closed: false, periods: [{ open: '00:00', close: '00:00' }] }])) as OpeningHours;
  }
  const parsed: Partial<Record<Weekday, { closed: boolean; periods: { open: string; close: string }[] }>> = {};
  for (const clause of value.split(';')) {
    const trimmed = clause.trim();
    if (!trimmed || /^ph\b/i.test(trimmed)) continue;
    const match = /^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))*(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)\s+(.+)$/i.exec(trimmed);
    const days = match ? parseOsmDays(match[1]) : orderedWeekdays;
    const hours = (match ? match[2] : trimmed).trim();
    if (!days.length) continue;
    if (/^(off|closed)$/i.test(hours)) {
      days.forEach((day) => { parsed[day] = { closed: true, periods: [] }; });
      continue;
    }
    const periods = hours.split(',').flatMap((range) => {
      const period = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(range.trim());
      const open = period ? normalizeOsmTime(period[1]) : null;
      const close = period ? normalizeOsmTime(period[2]) : null;
      return open && close ? [{ open, close }] : [];
    });
    if (periods.length) days.forEach((day) => { parsed[day] = { closed: false, periods }; });
  }
  return Object.keys(parsed).length ? parsed : null;
}

type OverpassElement = { type?: string; id?: number; tags?: { opening_hours?: string } };
type OverpassResponse = { elements?: OverpassElement[] };

export function parseOverpassResults(response: OverpassResponse): OpeningHours | null {
  const tag = response.elements?.map((element) => element.tags?.opening_hours).find((value): value is string => Boolean(value));
  return parseOsmOpeningHours(tag);
}

export function buildOverpassQuery(place: Pick<GeocodingResult, 'latitude' | 'longitude' | 'osmType' | 'osmId'>): string {
  const hasOsmId = place.osmType && Number.isInteger(place.osmId) && (place.osmId as number) > 0;
  if (hasOsmId) return `[out:json][timeout:10];${place.osmType}(${place.osmId});out tags center;`;
  return `[out:json][timeout:10];nwr(around:80,${place.latitude},${place.longitude})["opening_hours"];out tags center;`;
}

export function parseNominatimResults(results: NominatimResult[]): GeocodingResult[] {
  return results
    .map((result) => {
      const openingHours = parseOsmOpeningHours(result.extratags?.opening_hours);
      const osmType: GeocodingResult['osmType'] = result.osm_type === 'node' || result.osm_type === 'way' || result.osm_type === 'relation' ? result.osm_type : undefined;
      return ({
      id: String(result.place_id),
      title: result.name?.trim() || result.display_name.split(',')[0].trim(),
      displayName: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      ...(openingHours ? { openingHours } : {}),
      ...(osmType ? { osmType } : {}),
      ...(Number.isInteger(Number(result.osm_id)) ? { osmId: Number(result.osm_id) } : {}),
    });
    })
    .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude));
}

export function createCachedGeocodingSearch(search: GeocodingSearch): GeocodingSearch {
  const cache = new Map<string, Promise<GeocodingResult[]>>();
  return async (query) => {
    const normalized = normalizeGeocodingQuery(query);
    if (normalized.length < 2) return [];
    const key = normalized.toLocaleLowerCase('zh-Hant');
    const cached = cache.get(key);
    if (cached) return cached;
    const request = search(normalized).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, request);
    return request;
  };
}

export function createDebouncedGeocodingSearch(search: GeocodingSearch, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  return {
    schedule(query: string, onResults: (results: GeocodingResult[]) => void = () => undefined, onError: (error: unknown) => void = () => undefined) {
      generation += 1;
      const currentGeneration = generation;
      if (timer) clearTimeout(timer);
      const normalized = normalizeGeocodingQuery(query);
      if (normalized.length < 2) {
        onResults([]);
        return;
      }
      timer = setTimeout(async () => {
        try {
          const results = await search(normalized);
          if (currentGeneration === generation) onResults(results);
        } catch (error) {
          if (currentGeneration === generation) onError(error);
        }
      }, delayMs);
    },
    cancel() {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

async function requestNominatim(query: string): Promise<GeocodingResult[]> {
  let releaseQueue!: () => void;
  const previousRequest = requestQueue;
  requestQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previousRequest;
  try {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestStartedAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestStartedAt = Date.now();
    const url = `${configuredEndpoint}/search?format=jsonv2&limit=5&addressdetails=1&namedetails=1&extratags=1&accept-language=zh-TW&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7', 'User-Agent': 'TravelPlanner/1.0' } });
    if (!response.ok) throw new Error(response.status === 429 ? '地圖搜尋過於頻繁，請稍後再試' : '地圖搜尋失敗');
    return parseNominatimResults(await response.json());
  } finally {
    releaseQueue();
  }
}

export const searchNominatim = createCachedGeocodingSearch(requestNominatim);

/**
 * Uses Google Places (New) when a public API key is configured. If the key is
 * absent, or Google is temporarily unavailable, retain the existing OSM flow.
 */
export const searchPlaces = createCachedGeocodingSearch(async (query) => {
  if (hasGooglePlacesApiKey()) {
    try {
      return await searchGooglePlaces(query);
    } catch (error) {
      console.warn('[geocoding] Google Places unavailable, falling back to Nominatim', error);
    }
  }
  return requestNominatim(query);
});

const overpassEndpoint = (process.env.EXPO_PUBLIC_OVERPASS_URL || 'https://overpass-api.de/api/interpreter').replace(/\/$/, '');
const overpassCache = new Map<string, Promise<OpeningHours | null>>();

async function requestOverpass(query: string): Promise<OpeningHours | null> {
  const response = await fetch(`${overpassEndpoint}?data=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Overpass request failed (${response.status})`);
  return parseOverpassResults(await response.json() as OverpassResponse);
}

export function fetchOverpassOpeningHours(place: Pick<GeocodingResult, 'latitude' | 'longitude' | 'osmType' | 'osmId'>): Promise<OpeningHours | null> {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return Promise.resolve(null);
  const key = `${place.osmType ?? 'nearby'}:${place.osmId ?? `${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`}`;
  const cached = overpassCache.get(key);
  if (cached) return cached;
  const request = (async () => {
    const direct = await requestOverpass(buildOverpassQuery(place));
    if (direct || !place.osmType || !place.osmId) return direct;
    return requestOverpass(buildOverpassQuery({ latitude: place.latitude, longitude: place.longitude }));
  })().catch((error) => {
    overpassCache.delete(key);
    throw error;
  });
  overpassCache.set(key, request);
  return request;
}

export function canAutocompleteNominatim() {
  try {
    return new URL(configuredEndpoint).hostname !== 'nominatim.openstreetmap.org';
  } catch {
    return false;
  }
}

export function canAutocompletePlaces() {
  return hasGooglePlacesApiKey() || canAutocompleteNominatim();
}

export function getGeocodingAttribution(results: GeocodingResult[]) {
  return results.some((result) => result.provider === 'google')
    ? 'Powered by Google'
    : '資料來源：OpenStreetMap contributors';
}
