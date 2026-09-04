import { describe, expect, it, vi } from 'vitest';
import {
  createWeatherService,
  isWeatherAlert,
  parseOpenMeteoResponse,
  weatherCodeToPresentation,
} from '../lib/weather-api';

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
    });
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
      service.getForecast(25.03, 121.56, '2026-01-22'),
      service.getForecast(25.03, 121.56, '2026-01-22'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    });
  });

  it('returns a mock weather summary when Open-Meteo fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const service = createWeatherService(fetchMock);

    await expect(service.getForecast(25.03, 121.56, '2026-01-20')).resolves.toMatchObject({
      date: '2026-01-20',
      temperatureMinC: 24,
      temperatureMaxC: 24,
      precipitationProbability: 10,
    });
  });
});
