export type WeatherPresentation = { icon: string; condition: string; extreme: boolean };

export type WeatherDaySummary = WeatherPresentation & {
  date: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  precipitationWarning: boolean;
  extremeWarning: boolean;
  source: 'live' | 'cached' | 'mock';
  isSimulated: boolean;
  measuredPrecipitationMm?: number | null;
};

export type WeatherSummary = WeatherDaySummary & {
  forecast?: WeatherDaySummary[];
  currentTemperatureC?: number | null;
};

/** Bump when response mapping changes so an old in-memory weather entry is never reused. */
export const WEATHER_CACHE_VERSION = 'weather_cache_v6';

/** Stable fallback used when Open-Meteo cannot serve historical/out-of-range dates. */
export function createMockWeatherSummary(date: string): WeatherSummary {
  const summary: WeatherSummary = {
    date,
    icon: '☀️',
    condition: '晴天（示範）',
    extreme: false,
    temperatureMinC: 24,
    temperatureMaxC: 24,
    currentTemperatureC: 24,
    precipitationProbability: 10,
    weatherCode: 0,
    precipitationWarning: false,
    extremeWarning: false,
    source: 'mock',
    isSimulated: true,
  };
  summary.condition = `${summary.condition} · 模擬預報`;
  summary.forecast = Array.from({ length: 7 }, (_, index) => ({ ...summary, date: addDays(date, index) }));
  return summary;
}

type OpenMeteoPayload = {
  current?: {
    temperature_2m?: unknown;
    weather_code?: unknown;
    precipitation?: unknown;
    time?: unknown;
  };
  hourly?: {
    time?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
  };
  daily?: {
    time?: unknown;
    temperature_2m_min?: unknown;
    temperature_2m_max?: unknown;
    precipitation_probability_max?: unknown;
    precipitation_sum?: unknown;
    weather_code?: unknown;
  };
};

const EXTREME_CODES = new Set([65, 67, 75, 77, 82, 85, 86, 95, 96, 99]);
const NON_PRECIPITATION_CODES = new Set([0, 1, 2, 3, 45, 48]);
const NON_PRECIPITATION_RAIN_CAP = 20;
const LIGHT_DRIZZLE_CODES = new Set([51, 53, 56, 57]);
const DRIZZLE_PRECIPITATION_THRESHOLD_MM = 0.1;

/** Reject persisted/legacy entries that contradict their clear-weather code. */
export function isWeatherSummaryCacheValid(weather: WeatherSummary): boolean {
  const sanitized = sanitizeWeatherSummary(weather);
  const days = [weather, ...(weather.forecast ?? [])];
  const sanitizedDays = [sanitized, ...(sanitized.forecast ?? [])];
  return days.every((day, index) => {
    const clean = sanitizedDays[index];
    return day.weatherCode === clean?.weatherCode
      && day.precipitationProbability === clean?.precipitationProbability
      && day.precipitationWarning === clean?.precipitationWarning;
  });
}

function numberAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) return null;
  const number = Number(value[index]);
  return Number.isFinite(number) ? number : null;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTargetTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function findHourlyIndex(payload: OpenMeteoPayload, date: string, targetTime?: string | null): number {
  const times = Array.isArray(payload.hourly?.time) ? payload.hourly.time.map(String) : [];
  if (!times.length) return -1;
  const normalizedTime = normalizeTargetTime(targetTime);
  if (normalizedTime) {
    const exactIndex = times.findIndex((time) => time.startsWith(`${date}T${normalizedTime}`));
    if (exactIndex >= 0) return exactIndex;
  }
  const currentTime = typeof payload.current?.time === 'string' ? payload.current.time : null;
  if (currentTime && currentTime.startsWith(`${date}T`)) {
    const currentIndex = times.findIndex((time) => time === currentTime || time.startsWith(currentTime));
    if (currentIndex >= 0) return currentIndex;
  }
  return times.findIndex((time) => time.startsWith(`${date}T`));
}

/**
 * Daily cards are meant for daytime travel planning. Open-Meteo's
 * precipitation_probability_max can be dominated by a single overnight
 * shower, so take the peak local 08:00-20:00 hourly value when available.
 */
function daytimePrecipitationProbability(payload: OpenMeteoPayload, date: string, dailyIndex: number): number | null {
  const times = Array.isArray(payload.hourly?.time) ? payload.hourly.time.map(String) : [];
  const probabilities = payload.hourly?.precipitation_probability;
  const daytimeValues = times.reduce<number[]>((values, time, index) => {
    if (!time.startsWith(`${date}T`)) return values;
    const hour = Number(/^\d{4}-\d{2}-\d{2}T(\d{2}):/.exec(time)?.[1]);
    const probability = numberAt(probabilities, index);
    if (Number.isFinite(hour) && hour >= 8 && hour < 20 && probability !== null) values.push(probability);
    return values;
  }, []);
  if (daytimeValues.length) return Math.max(...daytimeValues);
  return numberAt(payload.daily?.precipitation_probability_max, dailyIndex);
}

function alignProbabilityWithWeatherPattern(weatherCode: number | null, probability: number | null): number | null {
  if (probability === null || weatherCode === null) return probability;
  return NON_PRECIPITATION_CODES.has(weatherCode)
    ? Math.min(probability, NON_PRECIPITATION_RAIN_CAP)
    : probability;
}

function normalizeWeatherCode(weatherCode: number | null, measuredPrecipitationMm: number | null): number | null {
  if (weatherCode !== null && LIGHT_DRIZZLE_CODES.has(weatherCode)
    && measuredPrecipitationMm !== null && measuredPrecipitationMm < DRIZZLE_PRECIPITATION_THRESHOLD_MM) {
    return 2;
  }
  return weatherCode;
}

function sanitizeWeatherDay(day: WeatherDaySummary): WeatherDaySummary {
  // Legacy cached cards do not carry measured precipitation. Treat that as
  // no measured rain so stale drizzle/high-POP values are safely corrected.
  const weatherCode = normalizeWeatherCode(day.weatherCode, day.measuredPrecipitationMm ?? 0);
  const precipitationProbability = alignProbabilityWithWeatherPattern(weatherCode, day.precipitationProbability);
  const presentation = weatherCodeToPresentation(weatherCode);
  return {
    ...day,
    ...presentation,
    weatherCode,
    precipitationProbability,
    precipitationWarning: precipitationProbability !== null && precipitationProbability > 60,
    extremeWarning: presentation.extreme,
    condition: weatherCode === day.weatherCode ? day.condition : presentation.condition,
  };
}

export function sanitizeWeatherForecast(forecast: WeatherDaySummary[] | null | undefined): WeatherDaySummary[] {
  return (forecast ?? []).map(sanitizeWeatherDay);
}

export function sanitizeWeatherSummary(weather: WeatherSummary): WeatherSummary {
  const sanitized = sanitizeWeatherDay(weather);
  return { ...weather, ...sanitized, forecast: sanitizeWeatherForecast(weather.forecast) };
}

function measuredDailyPrecipitation(payload: OpenMeteoPayload, date: string, dailyIndex: number): number | null {
  const times = Array.isArray(payload.hourly?.time) ? payload.hourly.time.map(String) : [];
  const hourlyPrecipitation = payload.hourly?.precipitation;
  const values = times.reduce<number[]>((result, time, index) => {
    if (!time.startsWith(`${date}T`)) return result;
    const hour = Number(/^\d{4}-\d{2}-\d{2}T(\d{2}):/.exec(time)?.[1]);
    if (!Number.isFinite(hour) || hour < 8 || hour >= 20) return result;
    const value = numberAt(hourlyPrecipitation, index);
    if (value !== null) result.push(value);
    return result;
  }, []);
  // Use the daytime peak as the measured signal. This prevents an overnight
  // total from keeping a daytime drizzle code/probability in the UI.
  if (values.length) return Math.max(...values);
  return numberAt(payload.daily?.precipitation_sum, dailyIndex);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.getTime())) return date;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weatherCodeToPresentation(code: number | null | undefined): WeatherPresentation {
  if (code === 0) return { icon: '☀️', condition: '晴朗', extreme: false };
  if (code === 1 || code === 2) return { icon: '🌤️', condition: '多雲', extreme: false };
  if (code === 3) return { icon: '☁️', condition: '陰天', extreme: false };
  if (code === 45 || code === 48) return { icon: '🌫️', condition: '有霧', extreme: false };
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return { icon: '🌦️', condition: '毛毛雨', extreme: false };
  if ([61, 63, 65, 66, 67].includes(code ?? -1)) return { icon: '🌧️', condition: '降雨', extreme: EXTREME_CODES.has(code as number) };
  if ([71, 73, 75, 77].includes(code ?? -1)) return { icon: '❄️', condition: '降雪', extreme: EXTREME_CODES.has(code as number) };
  if ([80, 81, 82].includes(code ?? -1)) return { icon: '🌧️', condition: '陣雨', extreme: EXTREME_CODES.has(code as number) };
  if (code === 85 || code === 86) return { icon: '🌨️', condition: '雪陣雨', extreme: true };
  if (code !== null && code !== undefined && code >= 95) return { icon: '⛈️', condition: '雷雨', extreme: true };
  return { icon: '🌤️', condition: '天氣未明', extreme: false };
}

export function isWeatherAlert(weather: WeatherSummary): boolean {
  return weather.precipitationWarning || weather.extremeWarning;
}

export function parseOpenMeteoResponse(payload: OpenMeteoPayload, date: string, source: 'live' | 'cached' = 'live', targetTime?: string | null): WeatherSummary | null {
  const daily = payload.daily;
  const dates = Array.isArray(daily?.time) ? daily.time.map(String) : [];
  const index = dates.indexOf(date);
  if (index < 0) return null;

  const hourlyIndex = findHourlyIndex(payload, date, targetTime);
  const rawWeatherCode = numberAt(payload.hourly?.weather_code, hourlyIndex) ?? numberAt(daily?.weather_code, index);
  const measuredPrecipitation = numberAt(payload.hourly?.precipitation, hourlyIndex)
    ?? numberValue(payload.current?.precipitation)
    ?? measuredDailyPrecipitation(payload, date, index);
  const weatherCode = normalizeWeatherCode(rawWeatherCode, measuredPrecipitation);
  const presentation = weatherCodeToPresentation(weatherCode);
  const precipitationProbability = alignProbabilityWithWeatherPattern(
    weatherCode,
    numberAt(payload.hourly?.precipitation_probability, hourlyIndex) ?? numberAt(daily?.precipitation_probability_max, index),
  );
  // `current.temperature_2m` is the live observation. The hourly value is only
  // a fallback for historical/out-of-range responses where current is absent.
  const currentTemperatureC = numberValue(payload.current?.temperature_2m) ?? numberAt(payload.hourly?.temperature_2m, hourlyIndex);
  return {
    date,
    temperatureMinC: numberAt(daily?.temperature_2m_min, index),
    temperatureMaxC: numberAt(daily?.temperature_2m_max, index),
    precipitationProbability,
    weatherCode,
    ...presentation,
    condition: `${presentation.condition} · ${source === 'live' ? '即時預報' : '快取預報'}`,
    precipitationWarning: precipitationProbability !== null && precipitationProbability > 60,
    extremeWarning: presentation.extreme,
    source,
    isSimulated: false,
    measuredPrecipitationMm: measuredPrecipitation,
    forecast: parseOpenMeteoForecast(payload, source),
    currentTemperatureC,
  };
}

export function parseOpenMeteoForecast(payload: OpenMeteoPayload, source: 'live' | 'cached' = 'live'): WeatherDaySummary[] {
  const daily = payload.daily;
  const dates = Array.isArray(daily?.time) ? daily.time.map(String) : [];
  if (!daily || dates.length === 0) return [];
  return dates.map((date, index) => {
    const rawWeatherCode = numberAt(daily.weather_code, index);
    const measuredPrecipitation = measuredDailyPrecipitation(payload, date, index);
    const weatherCode = normalizeWeatherCode(rawWeatherCode, measuredPrecipitation);
    const presentation = weatherCodeToPresentation(weatherCode);
    const precipitationProbability = alignProbabilityWithWeatherPattern(
      weatherCode,
      daytimePrecipitationProbability(payload, date, index),
    );
    return {
      date,
      temperatureMinC: numberAt(daily.temperature_2m_min, index),
      temperatureMaxC: numberAt(daily.temperature_2m_max, index),
      precipitationProbability,
      weatherCode,
      ...presentation,
      precipitationWarning: precipitationProbability !== null && precipitationProbability > 60,
      extremeWarning: presentation.extreme,
      source,
      isSimulated: false,
      measuredPrecipitationMm: measuredPrecipitation,
    };
  });
}

export type WeatherFetcher = typeof fetch;
export type WeatherServiceOptions = { ttlMs?: number; now?: () => number };
export type WeatherService = {
  getForecast: (latitude: number, longitude: number, date: string, timezone?: string | null, targetTime?: string | null) => Promise<WeatherSummary | null>;
};

/** Create a cached Open-Meteo client; cache entries are shared per service instance. */
export function createWeatherService(fetcher: WeatherFetcher = fetch.bind(globalThis), options: WeatherServiceOptions = {}): WeatherService {
  const cache = new Map<string, { expiresAt: number; value: Promise<WeatherSummary | null> }>();
  const ttlMs = options.ttlMs ?? 30 * 60 * 1000;
  const now = options.now ?? Date.now;

  function loadForecast(latitude: number, longitude: number, date: string, timezone: string | null = 'auto', targetTime: string | null = null, bypassCache = false): Promise<WeatherSummary | null> {
    if (!date) return Promise.resolve(null);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Promise.resolve(createMockWeatherSummary(date));
    const key = `${WEATHER_CACHE_VERSION}:${latitude.toFixed(5)},${longitude.toFixed(5)}:${date}:${timezone ?? 'auto'}:${normalizeTargetTime(targetTime) ?? 'auto'}`;
    const cached = cache.get(key);
    if (!bypassCache && cached && cached.expiresAt > now()) {
      return cached.value.then((value) => {
        if (value && !isWeatherSummaryCacheValid(value)) {
          cache.delete(key);
          return loadForecast(latitude, longitude, date, timezone, targetTime, true);
        }
        return value;
      });
    }
    if (cached) cache.delete(key);

    const endDate = addDays(date, 6);

    const params = [
      `latitude=${encodeURIComponent(latitude.toFixed(5))}`,
      `longitude=${encodeURIComponent(longitude.toFixed(5))}`,
      'current=temperature_2m,weather_code,precipitation',
      'hourly=temperature_2m,precipitation_probability,precipitation,weather_code',
      'daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum',
      `timezone=${encodeURIComponent(timezone || 'auto')}`,
      `start_date=${encodeURIComponent(date)}`,
      `end_date=${encodeURIComponent(endDate)}`,
    ].join('&');
    const requestUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
    console.debug('[Weather] Open-Meteo request', requestUrl);
    const request = fetcher(requestUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status})`);
        const payload = await response.json() as OpenMeteoPayload;
        console.debug('[Weather] Open-Meteo response', payload);
        return parseOpenMeteoResponse(payload, date, 'live', targetTime) ?? createMockWeatherSummary(date);
      })
      .catch((error) => {
        console.warn('[Weather] forecast lookup skipped', error);
        return createMockWeatherSummary(date);
      });
    cache.set(key, { expiresAt: now() + ttlMs, value: request });
    return request;
  }

  return {
    getForecast: (latitude, longitude, date, timezone = 'auto', targetTime = null) => loadForecast(latitude, longitude, date, timezone, targetTime),
  };
}

export const weatherService = createWeatherService();

export function fetchWeatherForecast(latitude: number, longitude: number, date: string, timezone?: string | null, targetTime?: string | null) {
  return weatherService.getForecast(latitude, longitude, date, timezone, targetTime);
}
