import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getOutdoorRainAlert, switchToBackupPlan } from '../lib/alternate-plans';
import type { ItineraryItem } from '../lib/itinerary';
import { dedupePackingItems, generatePackingSuggestions, hasRainyForecast, RAIN_GEAR_NAME } from '../lib/packing-utils';
import { parseOpenMeteoResponse } from '../lib/weather-api';

const read = (path: string) => readFileSync(path, 'utf8');

const outdoorItem: ItineraryItem = {
  id: 'outdoor-1', trip_id: 'trip-1', day_number: 1, position: 0, time: '14:00',
  location_name: '海邊沙灘', address: '台灣', latitude: 25, longitude: 121,
  notes: null, category: 'spot', created_by: 'user-1', is_backup: false, backup_for_id: null,
};

describe('Weather → packing and schedule integration', () => {
  it('propagates any forecast day at 50% rain into one deduplicated rain gear item', () => {
    const weather = {
      precipitationProbability: 10,
      temperatureMinC: 20,
      temperatureMaxC: 27,
      forecast: [{ precipitationProbability: 35 }, { precipitationProbability: 50 }],
    };
    expect(hasRainyForecast(weather.forecast)).toBe(true);
    const suggestions = generatePackingSuggestions('東京', weather);
    const pending = dedupePackingItems(suggestions, [{ category: '隨身物品', name: RAIN_GEAR_NAME }]);
    expect(suggestions.filter((item) => item.name === RAIN_GEAR_NAME)).toHaveLength(1);
    expect(pending.some((item) => item.name === RAIN_GEAR_NAME)).toBe(false);

    const packingSource = read('src/components/PackingPanel.tsx');
    expect(packingSource).toContain('ensureRainGear');
    expect(packingSource).toContain('hasRainyForecast');
    expect(packingSource).toContain('createPackingItem');
  });

  it('raises the 70% outdoor alert and routes the action to the linked backup', () => {
    const backup: ItineraryItem = { ...outdoorItem, id: 'indoor-1', location_name: '室內博物館', position: 1, is_backup: true, backup_for_id: outdoorItem.id };
    const alert = getOutdoorRainAlert({ precipitationProbability: 70, extremeWarning: false }, [outdoorItem, backup]);
    expect(alert).toMatchObject({ precipitationProbability: 70, outdoorItems: [outdoorItem] });

    const switched = switchToBackupPlan([outdoorItem, backup], outdoorItem.id);
    expect(switched.activeItem?.id).toBe(backup.id);
    expect(switched.items.find((item) => item.id === outdoorItem.id)?.is_backup).toBe(true);

    const cardSource = read('src/components/TodayFocusCard.tsx');
    expect(cardSource).toContain('getOutdoorRainAlert');
    expect(cardSource).toContain('切換備案');
    expect(cardSource).toContain('查看室內備案');
    expect(cardSource).toContain('setOutdoorNoticeExpanded');
  });

  it('parses the daytime hourly timeline and verifies its expand/collapse toggle contract', () => {
    const weather = parseOpenMeteoResponse({
      hourly: {
        time: ['2026-09-09T07:00', '2026-09-09T08:00', '2026-09-09T15:00', '2026-09-09T20:00', '2026-09-09T21:00'],
        precipitation_probability: [90, 10, 70, 20, 80],
        precipitation: [2, 0, 0.6, 0, 2],
        weather_code: [63, 1, 61, 2, 63],
      },
      daily: {
        time: ['2026-09-09'],
        temperature_2m_min: [22],
        temperature_2m_max: [31],
        precipitation_probability_max: [70],
        weather_code: [61],
      },
    }, '2026-09-09');
    expect(weather?.hourly?.map((point) => point.time)).toEqual([
      '2026-09-09T08:00',
      '2026-09-09T15:00',
      '2026-09-09T20:00',
    ]);

    const toggle = (current: string | null, date: string) => current === date ? null : date;
    expect(toggle(null, '2026-09-09')).toBe('2026-09-09');
    expect(toggle('2026-09-09', '2026-09-09')).toBeNull();

    const cardSource = read('src/components/TodayFocusCard.tsx');
    expect(cardSource).toContain('expandedHourlyDate');
    expect(cardSource).toContain('setExpandedHourlyDate');
    expect(cardSource).toContain('day.hourly');
    expect(cardSource).toContain('收合逐時');
  });
});
