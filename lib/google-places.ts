import type { GeocodingResult } from './geocoding';
import type { OpeningHours, OpeningHoursDay, OpeningPeriod, Weekday } from './itinerary';

const GOOGLE_AUTOCOMPLETE_ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';
const GOOGLE_TEXT_SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places';
const GOOGLE_WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const PLACE_ACTION_PATTERN = /(?:拍攝|拍照|拍|前往|前去|到|體驗|吃|買|購買|參拜|逛逛|逛|看|欣賞|休息|找|搭車|搭乘|返回|回到|入住|辦理入住|寄放行李|退房|早餐|午餐|晚餐|take\s+photos?|photograph|visit|go\s+to|heading\s+to|eat|buy|experience|relax|check\s*-?\s*(?:in|out))/giu;
const PLACE_TIME_PATTERN = /\b\d{1,2}(?::\d{2})?\s*(?:[~～-]\s*\d{1,2}(?::\d{2})?)?\b/gu;
const KNOWN_PLACE_NAMES = [
  'Universal Studios Japan', 'Grand Front', 'LUCUA Osaka', '大阪城公園', '大阪城', '環球影城',
  '黑門市場', '道頓堀', '戎橋', '固力果', '梅田', 'LUCUA', '難波', '心齋橋',
  '海遊館', '天保山', '住吉大社', '清水寺', '東京鐵塔', '關西國際機場', 'Kansai International Airport',
  'Dotonbori', 'Umeda', 'Namba', 'Shinsaibashi', 'Kuromon Market', 'Kiyomizu-dera',
].sort((left, right) => right.length - left.length);
const REGION_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /大阪(?:府|市)|osaka/iu, label: '大阪' },
  { pattern: /京都(?:府|市)|kyoto/iu, label: '京都' },
  { pattern: /東京(?:都|市)|tokyo/iu, label: '東京' },
  { pattern: /台北(?:市)?|新北(?:市)?|taipei/iu, label: '台北' },
  { pattern: /台中(?:市)?|taichung/iu, label: '台中' },
  { pattern: /首爾|seoul/iu, label: '首爾' },
];

function extractPlaceRegion(address?: string | null): string | null {
  const normalized = address?.trim();
  if (!normalized) return null;
  return REGION_HINTS.find(({ pattern }) => pattern.test(normalized))?.label ?? null;
}

/** Remove itinerary prose and add a location hint before Places searches. */
export function sanitizePlaceSearchQuery(name: string | null | undefined, address?: string | null): string {
  const source = typeof name === 'string' ? name : '';
  let cleaned = source
    .replace(PLACE_TIME_PATTERN, ' ')
    .replace(PLACE_ACTION_PATTERN, ' ')
    .replace(/[\u3010\u3011\[\]「」『』（）()：:，,、；;|｜]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const lowerCleaned = cleaned.toLocaleLowerCase();
  const primaryPlace = KNOWN_PLACE_NAMES
    .filter((candidate) => lowerCleaned.includes(candidate.toLocaleLowerCase()))
    .sort((left, right) => {
      const leftIndex = lowerCleaned.indexOf(left.toLocaleLowerCase());
      const rightIndex = lowerCleaned.indexOf(right.toLocaleLowerCase());
      return leftIndex - rightIndex || right.length - left.length;
    })[0];
  if (primaryPlace) cleaned = primaryPlace;
  const region = extractPlaceRegion(address);
  if (region && cleaned && !cleaned.toLocaleLowerCase().includes(region.toLocaleLowerCase())) return `${region} ${cleaned}`;
  return cleaned || region || address?.trim() || '';
}

type GoogleTime = { day?: number; hour?: number; minute?: number };
export type GoogleOpeningHoursPayload = {
  periods?: { open?: GoogleTime; close?: GoogleTime }[];
  weekdayDescriptions?: string[];
};

export type GooglePlacePhotoPayload = {
  /** Legacy Places API response field. */
  photo_reference?: string;
  /** Some proxy/adapters expose the camelCase equivalent. */
  photoReference?: string;
  /** Places API (New) resource name, e.g. places/…/photos/… . */
  name?: string;
  widthPx?: number;
  heightPx?: number;
  rating?: number;
  userRatingCount?: number;
  user_ratings_total?: number;
  width?: number;
  height?: number;
  types?: string[];
  displayName?: string;
};

export type GooglePlaceDetailsPayload = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  regularOpeningHours?: GoogleOpeningHoursPayload;
  photos?: GooglePlacePhotoPayload[];
};

type GoogleAutocompletePayload = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type GoogleTextSearchPayload = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    photos?: GooglePlacePhotoPayload[];
  }>;
  nextPageToken?: string;
};

export type GooglePlaceSearchPage = {
  results: GeocodingResult[];
  nextPageToken: string | null;
};

function emptyWeeklyHours(): Record<Weekday, OpeningHoursDay> {
  return Object.fromEntries(GOOGLE_WEEKDAYS.map((day) => [day, { closed: true, periods: [] }])) as unknown as Record<Weekday, OpeningHoursDay>;
}

function allDayHours(): OpeningPeriod[] {
  return [{ open: '00:00', close: '00:00' }];
}

function formatGoogleTime(value: GoogleTime | undefined): string | null {
  if (!value || !Number.isInteger(value.hour) || !Number.isInteger(value.minute)) return null;
  const hour = value.hour as number;
  const minute = value.minute as number;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayFromLabel(label: string): Weekday | null {
  const normalized = label.trim().toLocaleLowerCase();
  const aliases: Array<[Weekday, string[]]> = [
    ['sunday', ['sunday', '星期日', '週日', '周日', '禮拜日']],
    ['monday', ['monday', '星期一', '週一', '周一', '禮拜一']],
    ['tuesday', ['tuesday', '星期二', '週二', '周二', '禮拜二']],
    ['wednesday', ['wednesday', '星期三', '週三', '周三', '禮拜三']],
    ['thursday', ['thursday', '星期四', '週四', '周四', '禮拜四']],
    ['friday', ['friday', '星期五', '週五', '周五', '禮拜五']],
    ['saturday', ['saturday', '星期六', '週六', '周六', '禮拜六']],
  ];
  return aliases.find(([, names]) => names.some((name) => normalized === name || normalized.startsWith(`${name} `)))?.[0] ?? null;
}

function parseClockToken(value: string): string | null {
  const normalized = value.replace(/[\u202f\u00a0]/g, ' ').trim();
  const match = /^(上午|下午|晚上|中午)?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/iu.exec(normalized);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  const marker = (match[1] ?? match[4] ?? '').toLocaleLowerCase();
  if (hour < 1 || hour > 24 || minute > 59) return null;
  if (marker === '下午' || marker === '晚上' || marker === '中午' || marker === 'pm') {
    if (hour < 12) hour += 12;
  } else if (marker === '上午' || marker === 'am') {
    if (hour === 12) hour = 0;
  } else if (hour === 24) {
    hour = 0;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function clockMeridiem(value: string): string | null {
  return value.replace(/[\u202f\u00a0]/g, ' ').trim().match(/(?:上午|下午|晚上|中午|AM|PM)$/iu)?.[0] ?? null;
}

function parseDescriptionPeriods(value: string): OpeningPeriod[] | null {
  const normalized = value.replace(/[\u202f\u00a0]/g, ' ').trim();
  if (/^(closed|休息|公休|無營業|暫停營業)$/iu.test(normalized)) return [];
  if (/open\s*24\s*hours|24\s*hours|24\/7|全天|24 小時/iu.test(normalized)) return allDayHours();
  const clock = String.raw`(?:(?:上午|下午|晚上|中午)\s*)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)?`;
  const range = new RegExp(`(${clock})\\s*(?:-|–|—|~|〜|至|到|to)\\s*(${clock})`, 'giu');
  const periods: OpeningPeriod[] = [];
  for (const match of normalized.matchAll(range)) {
    const openMarker = clockMeridiem(match[1]);
    const closeMarker = clockMeridiem(match[2]);
    // Google often writes `2:30–4:30 PM`, omitting the meridiem on the
    // opening endpoint. Inherit the endpoint's marker before converting to
    // 24-hour time; otherwise the interval is incorrectly parsed as 02:30.
    const open = parseClockToken(openMarker || !closeMarker ? match[1] : `${match[1]} ${closeMarker}`);
    const close = parseClockToken(closeMarker || !openMarker ? match[2] : `${match[2]} ${openMarker}`);
    if (open && close) periods.push({ open, close });
  }
  return periods.length ? periods : null;
}

export function parseGoogleOpeningHours(value: GoogleOpeningHoursPayload | null | undefined): OpeningHours | null {
  if (!value) return null;
  if (Array.isArray(value.periods) && value.periods.length) {
    const weekly = emptyWeeklyHours();
    const alwaysOpen = value.periods.some((period) => {
      const open = period.open;
      return open?.day === 0 && open?.hour === 0 && open?.minute === 0 && !period.close;
    });
    if (alwaysOpen) {
      return Object.fromEntries(GOOGLE_WEEKDAYS.map((day) => [day, { closed: false, periods: allDayHours() }])) as OpeningHours;
    }
    let found = false;
    value.periods.forEach((period) => {
      const day = period.open?.day;
      const open = formatGoogleTime(period.open);
      if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6 || !open) return;
      const close = formatGoogleTime(period.close) ?? open;
      const weekday = GOOGLE_WEEKDAYS[day as number];
      weekly[weekday] = {
        closed: false,
        periods: [...(weekly[weekday].periods ?? []), { open, close }],
      };
      found = true;
    });
    if (found) return weekly;
  }

  if (Array.isArray(value.weekdayDescriptions) && value.weekdayDescriptions.length) {
    const weekly = emptyWeeklyHours();
    let found = false;
    value.weekdayDescriptions.forEach((description) => {
      const separator = description.search(/[:：]/);
      if (separator < 0) return;
      const weekday = dayFromLabel(description.slice(0, separator));
      if (!weekday) return;
      const periods = parseDescriptionPeriods(description.slice(separator + 1));
      if (!periods) return;
      weekly[weekday] = { closed: periods.length === 0, periods };
      found = true;
    });
    if (found) return weekly;
  }
  return null;
}

function getGoogleApiKey(apiKey?: string) {
  return (
    apiKey
    ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    ?? ''
  ).trim();
}

export function hasGooglePlacesApiKey() {
  return Boolean(getGoogleApiKey());
}

function normalizePlaceId(value: string) {
  return value.replace(/^places\//, '');
}

const GOOGLE_PHOTO_RESOURCE_PATTERN = /^places\/[A-Za-z0-9._~-]+\/photos\/[A-Za-z0-9._~-]+$/u;
const LEGACY_PHOTO_REFERENCE_PATTERN = /^[A-Za-z0-9._~:-]+$/u;

function normalizePhotoValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || /^(?:undefined|null|\[object object\])$/iu.test(normalized)) return undefined;
  return normalized;
}

/** True for the resource name returned by Places API (New). */
export function isGooglePhotoResourceName(value: unknown): value is string {
  return typeof value === 'string' && GOOGLE_PHOTO_RESOURCE_PATTERN.test(value.trim());
}

/**
 * Convert a Google photo payload into a safe value for our data model. Legacy
 * references remain opaque tokens; Places API (New) names are intentionally
 * preserved in full so callers can use the `/media` endpoint rather than the
 * incompatible legacy Maps Photo endpoint.
 */
const PHOTO_BLOCKLIST_PATTERN = /\b(?:food|restaurant|meal|cafe|coffee|interior|room|bedroom|lobby|indoor)\b/iu;
const PHOTO_OUTDOOR_PATTERN = /\b(?:park|outdoor|landscape|panorama|scenic|nature|landmark|temple|museum|street)\b/iu;

function photoReferenceValue(photo: GooglePlacePhotoPayload): string | undefined {
  const reference = normalizePhotoValue(photo.photo_reference ?? photo.photoReference);
  if (reference && (isGooglePhotoResourceName(reference) || LEGACY_PHOTO_REFERENCE_PATTERN.test(reference))) return reference;
  const resourceName = normalizePhotoValue(photo.name);
  return resourceName && isGooglePhotoResourceName(resourceName) ? resourceName : undefined;
}

/** Rank photos for an itinerary card, preferring outdoor panorama imagery. */
function scoreGooglePhoto(photo: GooglePlacePhotoPayload, index: number): number {
  const metadata = [photo.displayName, ...(photo.types ?? [])]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  if (PHOTO_BLOCKLIST_PATTERN.test(metadata)) return -100000 - index;
  let score = 0;
  const rating = Number(photo.rating);
  const reviewCount = Number(photo.userRatingCount ?? photo.user_ratings_total);
  if (Number.isFinite(rating)) score += rating * 100;
  if (Number.isFinite(reviewCount) && reviewCount > 0) score += Math.log10(reviewCount + 1) * 10;
  const width = Number(photo.widthPx ?? photo.width);
  const height = Number(photo.heightPx ?? photo.height);
  if (Number.isFinite(width) && Number.isFinite(height) && height > 0 && width / height >= 1.2) score += 25;
  if (PHOTO_OUTDOOR_PATTERN.test(metadata)) score += 20;
  return score - index * 0.001;
}

export function extractGooglePhotoReference(photos?: GooglePlacePhotoPayload[] | null): string | undefined {
  const candidates = (photos ?? [])
    .filter((photo): photo is GooglePlacePhotoPayload => Boolean(photo && typeof photo === 'object'))
    .map((photo, index) => ({ photo, index, reference: photoReferenceValue(photo) }))
    .filter((candidate): candidate is { photo: GooglePlacePhotoPayload; index: number; reference: string } => Boolean(candidate.reference));
  if (!candidates.length) return undefined;
  const suitable = candidates.filter(({ photo, index }) => scoreGooglePhoto(photo, index) > -100000);
  // If every returned image is clearly food/indoor imagery, don't persist a
  // misleading reference; callers will render their category fallback.
  if (!suitable.length) return undefined;
  const ranked = suitable.sort((left, right) => {
    const scoreDifference = scoreGooglePhoto(right.photo, right.index) - scoreGooglePhoto(left.photo, left.index);
    return scoreDifference || left.index - right.index;
  });
  return ranked[0]?.reference;
}

async function searchGooglePlacesAutocomplete(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  const key = getGoogleApiKey(apiKey);
  const sanitizedQuery = sanitizePlaceSearchQuery(query);
  if (!key) return [];
  const response = await fetch(GOOGLE_AUTOCOMPLETE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify({ input: sanitizedQuery, languageCode: 'zh-TW' }),
  });
  if (!response.ok) throw new Error(`Google Places 搜尋失敗 (${response.status})`);
  const payload = await response.json() as GoogleAutocompletePayload;
  return (payload.suggestions ?? []).flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    const placeId = prediction?.placeId;
    if (!placeId) return [];
    const mainText = prediction.structuredFormat?.mainText?.text?.trim() || prediction.text?.text?.trim();
    if (!mainText) return [];
    const secondaryText = prediction.structuredFormat?.secondaryText?.text?.trim();
    const displayName = secondaryText ? `${mainText}, ${secondaryText}` : (prediction.text?.text?.trim() || mainText);
    return [{
      id: `google:${normalizePlaceId(placeId)}`,
      googlePlaceId: normalizePlaceId(placeId),
      provider: 'google' as const,
      title: mainText,
      displayName,
      latitude: Number.NaN,
      longitude: Number.NaN,
    }];
  });
}

function mapTextSearchPlaces(payload: GoogleTextSearchPayload): GeocodingResult[] {
  return (payload.places ?? []).flatMap((place) => {
    const placeId = place.id ? normalizePlaceId(place.id) : '';
    const title = place.displayName?.text?.trim() || place.formattedAddress?.split(',')[0]?.trim();
    if (!placeId || !title) return [];
    const latitude = Number(place.location?.latitude);
    const longitude = Number(place.location?.longitude);
    const photoReference = extractGooglePhotoReference(place.photos);
    return [{
      id: `google:${placeId}`,
      googlePlaceId: placeId,
      provider: 'google' as const,
      title,
      displayName: place.formattedAddress?.trim() || title,
      latitude: Number.isFinite(latitude) ? latitude : Number.NaN,
      longitude: Number.isFinite(longitude) ? longitude : Number.NaN,
      ...(photoReference ? { photoReference } : {}),
    }];
  });
}

export async function searchGooglePlacesTextPage(query: string, apiKey?: string, pageToken?: string): Promise<GooglePlaceSearchPage> {
  const key = getGoogleApiKey(apiKey);
  const normalizedQuery = sanitizePlaceSearchQuery(query);
  if (!key || !normalizedQuery) return { results: [], nextPageToken: null };
  const response = await fetch(GOOGLE_TEXT_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.photos,nextPageToken',
    },
    body: JSON.stringify({
      textQuery: normalizedQuery,
      languageCode: 'zh-TW',
      ...(pageToken?.trim() ? { pageToken: pageToken.trim() } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Google Places Text Search failed (${response.status})`);
  const payload = await response.json() as GoogleTextSearchPayload;
  return {
    results: mapTextSearchPlaces(payload),
    nextPageToken: payload.nextPageToken?.trim() || null,
  };
}

export async function searchGooglePlacesText(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  return (await searchGooglePlacesTextPage(query, apiKey)).results;
}

export async function searchGooglePlaces(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  const key = getGoogleApiKey(apiKey);
  const normalizedQuery = sanitizePlaceSearchQuery(query);
  if (!key || !normalizedQuery) return [];
  try {
    const results = await searchGooglePlacesAutocomplete(normalizedQuery, key);
    if (results.length) return results;
  } catch (error) {
    console.warn('[Google Places] autocomplete failed; trying Text Search', error);
  }
  return searchGooglePlacesText(normalizedQuery, key);
}

export async function fetchGooglePlaceDetails(placeId: string, apiKey?: string): Promise<GeocodingResult> {
  const key = getGoogleApiKey(apiKey);
  if (!key) throw new Error('尚未設定 Google Places API Key');
  const normalizedId = normalizePlaceId(placeId);
  const response = await fetch(`${GOOGLE_DETAILS_ENDPOINT}/${encodeURIComponent(normalizedId)}?languageCode=zh-TW`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,regularOpeningHours,photos',
    },
  });
  if (!response.ok) throw new Error(`Google Place 詳細資料取得失敗 (${response.status})`);
  return parseGooglePlaceDetails(await response.json() as GooglePlaceDetailsPayload);
}

/** Prefer a localized CJK address when the Details response falls back to English. */
export function pickPreferredPlaceAddress(primary?: string | null, fallback?: string | null): string | null {
  const candidates = [primary, fallback].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return candidates.find((value) => /[\u3400-\u9fff]/u.test(value)) ?? candidates[0] ?? null;
}

/** Keep the address shown by search when it already contains localized text. */
export function resolveTripPlaceAddress(searchAddress?: string | null, detailsAddress?: string | null): string | null {
  const searched = searchAddress?.trim();
  if (searched && /[\u3400-\u9fff]/u.test(searched)) return searched;
  return pickPreferredPlaceAddress(detailsAddress, searched);
}

export function parseGooglePlaceDetails(payload: GooglePlaceDetailsPayload): GeocodingResult {
  const placeId = normalizePlaceId(payload.id ?? payload.name ?? '');
  const title = payload.displayName?.text?.trim() || payload.formattedAddress?.split(',')[0]?.trim() || '未命名地點';
  const displayName = payload.formattedAddress?.trim() || title;
  const latitude = Number(payload.location?.latitude);
  const longitude = Number(payload.location?.longitude);
  const openingHours = parseGoogleOpeningHours(payload.regularOpeningHours);
  const photoReference = extractGooglePhotoReference(payload.photos);
  return {
    id: `google:${placeId}`,
    googlePlaceId: placeId,
    provider: 'google',
    title,
    displayName,
    latitude,
    longitude,
    ...(openingHours ? { openingHours } : {}),
    ...(photoReference ? { photoReference } : {}),
  };
}
