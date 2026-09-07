import type { GeocodingResult } from './geocoding';
import type { OpeningHours, OpeningHoursDay, OpeningPeriod, Weekday } from './itinerary';

const GOOGLE_AUTOCOMPLETE_ENDPOINT = 'https://places.googleapis.com/v1/places:autocomplete';
const GOOGLE_TEXT_SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places';
const GOOGLE_WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type GoogleTime = { day?: number; hour?: number; minute?: number };
export type GoogleOpeningHoursPayload = {
  periods?: { open?: GoogleTime; close?: GoogleTime }[];
  weekdayDescriptions?: string[];
};

export type GooglePlaceDetailsPayload = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  regularOpeningHours?: GoogleOpeningHoursPayload;
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
  }>;
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
  return (apiKey ?? process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
}

export function hasGooglePlacesApiKey() {
  return Boolean(getGoogleApiKey());
}

function normalizePlaceId(value: string) {
  return value.replace(/^places\//, '');
}

async function searchGooglePlacesAutocomplete(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  const key = getGoogleApiKey(apiKey);
  if (!key) return [];
  const response = await fetch(GOOGLE_AUTOCOMPLETE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify({ input: query.trim(), languageCode: 'zh-TW' }),
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
    return [{
      id: `google:${placeId}`,
      googlePlaceId: placeId,
      provider: 'google' as const,
      title,
      displayName: place.formattedAddress?.trim() || title,
      latitude: Number.isFinite(latitude) ? latitude : Number.NaN,
      longitude: Number.isFinite(longitude) ? longitude : Number.NaN,
    }];
  });
}

export async function searchGooglePlacesText(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  const key = getGoogleApiKey(apiKey);
  const normalizedQuery = query.trim();
  if (!key || !normalizedQuery) return [];
  const response = await fetch(GOOGLE_TEXT_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: normalizedQuery, languageCode: 'zh-TW' }),
  });
  if (!response.ok) throw new Error(`Google Places Text Search failed (${response.status})`);
  return mapTextSearchPlaces(await response.json() as GoogleTextSearchPayload);
}

export async function searchGooglePlaces(query: string, apiKey?: string): Promise<GeocodingResult[]> {
  const key = getGoogleApiKey(apiKey);
  const normalizedQuery = query.trim();
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
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,regularOpeningHours',
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

export function parseGooglePlaceDetails(payload: GooglePlaceDetailsPayload): GeocodingResult {
  const placeId = normalizePlaceId(payload.id ?? payload.name ?? '');
  const title = payload.displayName?.text?.trim() || payload.formattedAddress?.split(',')[0]?.trim() || '未命名地點';
  const displayName = payload.formattedAddress?.trim() || title;
  const latitude = Number(payload.location?.latitude);
  const longitude = Number(payload.location?.longitude);
  const openingHours = parseGoogleOpeningHours(payload.regularOpeningHours);
  return {
    id: `google:${placeId}`,
    googlePlaceId: placeId,
    provider: 'google',
    title,
    displayName,
    latitude,
    longitude,
    ...(openingHours ? { openingHours } : {}),
  };
}
