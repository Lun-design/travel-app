export type WeatherPresentation = { icon: string; condition: string; extreme: boolean };

export type WeatherSummary = WeatherPresentation & {
  date: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  precipitationWarning: boolean;
  extremeWarning: boolean;
  source: 'live' | 'cached' | 'mock';
  isSimulated: boolean;
};

/** Stable fallback used when Open-Meteo cannot serve historical/out-of-range dates. */
export function createMockWeatherSummary(date: string): WeatherSummary {
  const summary: WeatherSummary = {
    date,
    icon: '☀️',
    condition: '晴天（示範）',
    extreme: false,
    temperatureMinC: 24,
    temperatureMaxC: 24,
    precipitationProbability: 10,
    weatherCode: 0,
    precipitationWarning: false,
    extremeWarning: false,
    source: 'mock',
    isSimulated: true,
  };
  summary.condition = `${summary.condition} · 模擬預報`;
  return summary;
}

type OpenMeteoPayload = {
  daily?: {
    time?: unknown;
    temperature_2m_min?: unknown;
    temperature_2m_max?: unknown;
    precipitation_probability_max?: unknown;
    weather_code?: unknown;
  };
};

const EXTREME_CODES = new Set([65, 67, 75, 77, 82, 85, 86, 95, 96, 99]);

function numberAt(value: unknown, index: number): number | null {
  if (!Array.isArray(value)) return null;
  const number = Number(value[index]);
  return Number.isFinite(number) ? number : null;
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

export function parseOpenMeteoResponse(payload: OpenMeteoPayload, date: string, source: 'live' | 'cached' = 'live'): WeatherSummary | null {
  const daily = payload.daily;
  const dates = Array.isArray(daily?.time) ? daily.time.map(String) : [];
  const index = dates.indexOf(date);
  if (index < 0) return null;

  const weatherCode = numberAt(daily?.weather_code, index);
  const presentation = weatherCodeToPresentation(weatherCode);
  const precipitationProbability = numberAt(daily?.precipitation_probability_max, index);
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
  };
}

export type WeatherFetcher = typeof fetch;
export type WeatherService = {
  getForecast: (latitude: number, longitude: number, date: string, timezone?: string | null) => Promise<WeatherSummary | null>;
};

/** Create a cached Open-Meteo client; cache entries are shared per service instance. */
export function createWeatherService(fetcher: WeatherFetcher = fetch.bind(globalThis)): WeatherService {
  const cache = new Map<string, Promise<WeatherSummary | null>>();

  return {
    getForecast(latitude, longitude, date, timezone = 'auto') {
      if (!date) return Promise.resolve(null);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Promise.resolve(createMockWeatherSummary(date));
      const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}:${date}:${timezone ?? 'auto'}`;
      const cached = cache.get(key);
      if (cached) return cached;

      const params = [
        `latitude=${encodeURIComponent(latitude.toFixed(5))}`,
        `longitude=${encodeURIComponent(longitude.toFixed(5))}`,
        'daily=weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max',
        `timezone=${encodeURIComponent(timezone || 'auto')}`,
        `start_date=${encodeURIComponent(date)}`,
        `end_date=${encodeURIComponent(date)}`,
      ].join('&');
      const request = fetcher(`https://api.open-meteo.com/v1/forecast?${params}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status})`);
          return parseOpenMeteoResponse(await response.json() as OpenMeteoPayload, date) ?? createMockWeatherSummary(date);
        })
        .catch((error) => {
          console.warn('[Weather] forecast lookup skipped', error);
          return createMockWeatherSummary(date);
        });
      cache.set(key, request);
      return request;
    },
  };
}

export const weatherService = createWeatherService();

export function fetchWeatherForecast(latitude: number, longitude: number, date: string, timezone?: string | null) {
  return weatherService.getForecast(latitude, longitude, date, timezone);
}
