import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGlobalItineraryPayload,
  classifyGlobalPlace,
  RECOMMENDATION_THEMES,
  normalizeGlobalPlace,
  searchDynamicRecommendations,
  searchGlobalPlaces,
  type GlobalPlaceSearchResult,
} from '../lib/global-recommendations';
import type { GeocodingResult } from '../lib/geocoding';

const tokyoTower: GeocodingResult = {
  id: 'tokyo-tower',
  title: '東京鐵塔',
  displayName: '東京鐵塔, 港區, 東京, 日本',
  latitude: 35.6586,
  longitude: 139.7454,
  provider: 'osm',
};

describe('global recommendation helpers', () => {
  it('normalizes a worldwide place with city, country, duration and timezone', () => {
    const result = normalizeGlobalPlace(tokyoTower);

    expect(result).toMatchObject({
      id: 'tokyo-tower',
      title: '東京鐵塔',
      address: '東京鐵塔, 港區, 東京, 日本',
      latitude: 35.6586,
      longitude: 139.7454,
      city: '東京',
      country: '日本',
      timezone: 'Asia/Tokyo',
      category: 'outdoor',
      estimatedDurationMinutes: 60,
    });
  });

  it('classifies indoor and outdoor landmarks using multilingual place signals', () => {
    expect(classifyGlobalPlace({ title: 'Louvre Museum', address: 'Paris, France' })).toBe('indoor');
    expect(classifyGlobalPlace({ title: 'Central Park', address: 'New York, USA' })).toBe('outdoor');
    expect(classifyGlobalPlace({ title: '清水寺', address: '京都, 日本', types: ['tourist_attraction'] })).toBe('other');
  });

  it('searches through an injected provider without touching the network', async () => {
    const provider = async (query: string): Promise<GeocodingResult[]> => query.includes('巴黎')
      ? [{ id: 'louvre', title: '羅浮宮', displayName: '羅浮宮, 巴黎, 法國', latitude: 48.8606, longitude: 2.3376, provider: 'osm' }]
      : [];

    await expect(searchGlobalPlaces('巴黎羅浮宮', provider)).resolves.toEqual([
      expect.objectContaining({ title: '羅浮宮', city: '巴黎', country: '法國', timezone: 'Europe/Paris' }),
    ]);
  });

  it('keeps international coordinates and timezone when creating an itinerary payload', () => {
    const result: GlobalPlaceSearchResult = normalizeGlobalPlace({
      id: 'louvre',
      title: '羅浮宮',
      displayName: '羅浮宮, 巴黎, 法國',
      latitude: 48.8606,
      longitude: 2.3376,
      provider: 'osm',
    });

    expect(buildGlobalItineraryPayload(result, {
      tripId: 'trip-1',
      createdBy: 'user-1',
      dayNumber: 2,
      startTime: '10:30',
    })).toEqual(expect.objectContaining({
      trip_id: 'trip-1',
      location_name: '羅浮宮',
      address: '羅浮宮, 巴黎, 法國',
      latitude: 48.8606,
      longitude: 2.3376,
      duration_minutes: 90,
      timezone: 'Europe/Paris',
    }));
  });

  it('exposes a one-click add interaction in the recommendation panel', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/RecommendationPanel.tsx'), 'utf8');
    expect(source).toContain('searchGlobalPlaces');
    expect(source).toContain('onAddToItinerary');
    expect(source).toContain('一鍵帶入');
    expect(source).toContain('estimatedDurationMinutes');
    expect(source).toContain('timezone');
    expect(source).toContain('RECOMMENDATION_THEMES');
    expect(source).toContain('searchDynamicRecommendations');
    expect(source).toContain('選擇推薦地區');
    expect(source).toContain('destinationInput');
    expect(source).toContain('recommendationLoading');
  });

  it('exposes all four theme tabs for zero-input recommendations', () => {
    expect(RECOMMENDATION_THEMES.map((theme) => theme.id)).toEqual(['must-see', 'food', 'indoor', 'free-time']);
  });

  it('queries the external places provider with the selected destination and theme', async () => {
    const queries: string[] = [];
    const provider = async (query: string): Promise<GeocodingResult[]> => {
      queries.push(query);
      return [{ id: 'place-1', title: 'Test Cafe', displayName: 'Test Cafe, Banqiao, Taiwan', latitude: 25.011, longitude: 121.461 }];
    };

    const results = await searchDynamicRecommendations('板橋', 'food', provider);

    expect(queries[0]).toContain('板橋');
    expect(queries[0]).toContain('美食');
    expect(results[0]).toMatchObject({ title: 'Test Cafe', latitude: 25.011, longitude: 121.461 });
  });
});
