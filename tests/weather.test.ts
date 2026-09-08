import { describe, expect, it, vi } from 'vitest';
import {
  createWeatherService,
  fetchWeatherForecast,
  isWeatherAlert,
  parseOpenMeteoForecast,
  parseOpenMeteoResponse,
  WEATHER_CACHE_VERSION,
  weatherCodeToPresentation,
} from '../lib/weather-api';
import { blockedNetworkFetch } from './setup';

describe('weather helpers', () => {
  it('maps Open-Meteo weather codes to UI presentation', () => {
    expect(weatherCodeToPresentation(0)).toEqual({ icon: '☀️', condition: '晴朗', extreme: false });
    expect(weatherCodeToPresentation(63)).toEqual({ icon: '🌧️', condition: '降雨', extreme: false });
    expect(weatherCodeToPresentation(95)).toEqual({ icon: '⛈️', condition: '雷雨', extreme: true });
  });

  it('parses daily temperature and precipitation for the requested date', () => {
    const weather = parseOpenMeteoResponse({
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [14],
        temperature_2m_max: [21],
        precipitation_probability_max: [72],
        weather_code: [63],
      },
    }, '2026-01-22');

    expect(weather).toMatchObject({
      date: '2026-01-22',
      temperatureMinC: 14,
      temperatureMaxC: 21,
      precipitationProbability: 72,
      weatherCode: 63,
      precipitationWarning: true,
      extremeWarning: false,
      source: 'live',
      isSimulated: false,
    });
    expect(weather?.condition).toContain('即時預報');
  });

  it('flags extreme weather even when precipitation probability is low', () => {
    const weather = parseOpenMeteoResponse({
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [2],
        temperature_2m_max: [8],
        precipitation_probability_max: [10],
        weather_code: [95],
      },
    }, '2026-01-22');

    expect(weather && isWeatherAlert(weather)).toBe(true);
  });

  it('caches the same coordinate/date request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [14],
        temperature_2m_max: [21],
        precipitation_probability_max: [20],
        weather_code: [1],
      },
    }), { status: 200 }));
    const service = createWeatherService(fetchMock);

    await Promise.all([
      service.getForecast(25.03, 121.56, '2026-01-22', 'Asia/Tokyo'),
      service.getForecast(25.03, 121.56, '2026-01-22', 'Asia/Tokyo'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('timezone=Asia%2FTokyo');
  });

  it('returns a mock weather summary when the requested date is outside the forecast response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ daily: { time: ['2026-01-23'] } }), { status: 200 }));
    const service = createWeatherService(fetchMock);

    await expect(service.getForecast(25.03, 121.56, '2026-01-20')).resolves.toMatchObject({
      date: '2026-01-20',
      icon: '☀️',
      temperatureMinC: 24,
      temperatureMaxC: 24,
      precipitationProbability: 10,
      precipitationWarning: false,
      extremeWarning: false,
      source: 'mock',
      isSimulated: true,
    });
  });

  it('returns a mock weather summary when Open-Meteo fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const service = createWeatherService(fetchMock);

    await expect(service.getForecast(25.03, 121.56, '2026-01-20')).resolves.toMatchObject({
      date: '2026-01-20',
      temperatureMinC: 24,
      temperatureMaxC: 24,
      precipitationProbability: 10,
      source: 'mock',
      isSimulated: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('[Weather] forecast lookup skipped', expect.any(Error));
  });

  it('keeps the default weather singleton offline in the test environment', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(fetchWeatherForecast(24.12345, 121.54321, '2099-01-01')).resolves.toMatchObject({
      date: '2099-01-01',
      temperatureMinC: 24,
      temperatureMaxC: 24,
      precipitationProbability: 10,
    });
    expect(blockedNetworkFetch).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('[Weather] forecast lookup skipped', expect.any(Error));
  });

  it('returns a seven-day forecast and requests a seven-day date window', async () => {
    const dates = Array.from({ length: 7 }, (_, index) => `2026-01-${String(22 + index).padStart(2, '0')}`);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      daily: {
        time: dates,
        temperature_2m_min: [14, 15, 13, 16, 17, 18, 19],
        temperature_2m_max: [21, 22, 20, 23, 24, 25, 26],
        precipitation_probability_max: [20, 55, 10, 80, 30, 0, 15],
        weather_code: [1, 63, 0, 65, 2, 3, 1],
      },
    }), { status: 200 }));
    const service = createWeatherService(fetchMock);

    const weather = await service.getForecast(25.03, 121.56, '2026-01-22', 'Asia/Taipei');

    expect(weather?.forecast).toHaveLength(7);
    expect(weather?.forecast?.[1]).toMatchObject({ date: '2026-01-23', precipitationProbability: 55, weatherCode: 63 });
    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(requestUrl.searchParams.get('start_date')).toBe('2026-01-22');
    expect(requestUrl.searchParams.get('end_date')).toBe('2026-01-28');
    expect(requestUrl.searchParams.get('current')).toBe('temperature_2m,weather_code,precipitation');
  });

  it('parses the current temperature from Open-Meteo current data', () => {
    const weather = parseOpenMeteoResponse({
      current: { temperature_2m: 19.5, weather_code: 1 },
      daily: { time: ['2026-01-22'], temperature_2m_min: [14], temperature_2m_max: [21], precipitation_probability_max: [20], weather_code: [1] },
    }, '2026-01-22');

    expect(weather?.currentTemperatureC).toBe(19.5);
  });

  it('uses the requested Taipei local hour instead of the daily maximum rain probability', () => {
    const weather = parseOpenMeteoResponse({
      current: { temperature_2m: 29, weather_code: 1, time: '2026-01-22T10:00' },
      hourly: {
        time: ['2026-01-22T09:00', '2026-01-22T10:00', '2026-01-22T14:00'],
        temperature_2m: [20, 21, 24],
        precipitation_probability: [94, 10, 20],
        weather_code: [63, 1, 1],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [14],
        temperature_2m_max: [25],
        precipitation_probability_max: [94],
        weather_code: [63],
      },
    }, '2026-01-22', 'live', '10:00');

    expect(weather).toMatchObject({
      precipitationProbability: 10,
      weatherCode: 1,
      currentTemperatureC: 29,
      precipitationWarning: false,
    });
  });

  it('uses daytime hourly values for each daily forecast instead of overnight maxima', () => {
    const weather = parseOpenMeteoResponse({
      hourly: {
        time: ['2026-01-22T02:00', '2026-01-22T10:00', '2026-01-23T02:00', '2026-01-23T10:00'],
        temperature_2m: [24, 29, 23, 28],
        precipitation_probability: [94, 0, 94, 10],
        weather_code: [63, 1, 63, 63],
      },
      daily: {
        time: ['2026-01-22', '2026-01-23'],
        temperature_2m_min: [22, 21],
        temperature_2m_max: [30, 29],
        precipitation_probability_max: [0, 10],
        weather_code: [1, 63],
      },
    }, '2026-01-22', 'live', '10:00');

    expect(weather?.forecast?.map((day) => day.precipitationProbability)).toEqual([0, 10]);
  });

  it('calculates daily-card rain probability as the daytime peak from 08:00-20:00', () => {
    const forecast = parseOpenMeteoForecast({
      hourly: {
        time: [
          '2026-01-22T02:00',
          '2026-01-22T08:00',
          '2026-01-22T10:00',
          '2026-01-22T12:00',
          '2026-01-22T19:00',
          '2026-01-22T20:00',
        ],
        precipitation_probability: [94, 10, 0, 20, 10, 94],
        weather_code: [63, 1, 1, 1, 1, 63],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [22],
        temperature_2m_max: [30],
        precipitation_probability_max: [94],
        weather_code: [1],
      },
    });

    expect(forecast[0]?.precipitationProbability).toBe(20);
  });

  it('uses a versioned cache namespace after weather parsing changes', () => {
    expect(WEATHER_CACHE_VERSION).toBe('weather_cache_v5');
  });

  it('suppresses implausibly high rain probability for a clear daytime WMO pattern', () => {
    const forecast = parseOpenMeteoForecast({
      hourly: {
        time: ['2026-01-22T10:00'],
        precipitation_probability: [94],
        weather_code: [1],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [24],
        temperature_2m_max: [31],
        precipitation_probability_max: [94],
        weather_code: [1],
      },
    });

    expect(forecast[0]).toMatchObject({ weatherCode: 1, condition: expect.any(String), precipitationProbability: 20, precipitationWarning: false });
  });

  it('downgrades light drizzle codes when measured precipitation is below 0.1mm', () => {
    const weather = parseOpenMeteoResponse({
      current: { temperature_2m: 29, weather_code: 51, precipitation: 0 },
      hourly: {
        time: ['2026-01-22T10:00'],
        precipitation_probability: [87],
        precipitation: [0],
        weather_code: [51],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [24],
        temperature_2m_max: [31],
        precipitation_probability_max: [94],
        precipitation_sum: [0],
        weather_code: [51],
      },
    }, '2026-01-22', 'live', '10:00');

    expect(weather).toMatchObject({ weatherCode: 2, precipitationProbability: 20, precipitationWarning: false });
    expect(weather?.forecast?.[0]).toMatchObject({ weatherCode: 2, precipitationProbability: 20, precipitationWarning: false });
  });

  it('requests hourly precipitation with the explicit Asia/Taipei timezone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hourly: {
        time: ['2026-01-22T10:00'],
        temperature_2m: [21],
        precipitation_probability: [10],
        weather_code: [1],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [14],
        temperature_2m_max: [25],
        precipitation_probability_max: [94],
        weather_code: [63],
      },
    }), { status: 200 }));
    const service = createWeatherService(fetchMock);

    await service.getForecast(25.014, 121.463, '2026-01-22', 'Asia/Taipei', '10:00');

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(requestUrl.searchParams.get('timezone')).toBe('Asia/Taipei');
    expect(requestUrl.searchParams.get('hourly')).toContain('precipitation_probability');
  });

  it('revalidates a weather entry after the 30-minute TTL expires', async () => {
    let now = 0;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      daily: { time: ['2026-01-22'], temperature_2m_min: [14], temperature_2m_max: [21], precipitation_probability_max: [20], weather_code: [1] },
    }), { status: 200 })));
    const service = createWeatherService(fetchMock, { ttlMs: 30 * 60 * 1000, now: () => now });

    await service.getForecast(25.03, 121.56, '2026-01-22');
    await service.getForecast(25.03, 121.56, '2026-01-22');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 30 * 60 * 1000 + 1;
    await service.getForecast(25.03, 121.56, '2026-01-22');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
