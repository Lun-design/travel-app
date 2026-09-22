import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGlobalItineraryPayload,
  classifyGlobalPlace,
  RECOMMENDATION_THEMES,
  getRecommendationSubcategories,
  normalizeGlobalPlace,
  paginateRecommendations,
  buildRecommendationQuery,
  buildExpandedRecommendationQuery,
  getCuratedRecommendations,
  getLocalRecommendationFallback,
  createRecommendationSessionCache,
  filterGlobalRecommendationsByDestination,
  filterGlobalRecommendationsBySubcategory,
  searchDynamicRecommendations,
  searchDynamicRecommendationsPage,
  searchGlobalPlaces,
  type GlobalPlaceSearchResult,
} from '../lib/global-recommendations';
import type { GeocodingResult } from '../lib/geocoding';
import { clearPlacesAuthBlock, markPlacesAuthInvalid } from '../lib/places-auth-guard';

afterEach(() => clearPlacesAuthBlock());

const tokyoTower: GeocodingResult = {
  id: 'tokyo-tower',
  title: '東京鐵塔',
  displayName: '東京鐵塔, 港區, 東京, 日本',
  latitude: 35.6586,
  longitude: 139.7454,
  provider: 'osm',
};

describe('global recommendation helpers', () => {
  it('falls back to static seeds without issuing a provider request when auth is expired', async () => {
    markPlacesAuthInvalid();
    const page = await searchDynamicRecommendationsPage('大阪', 'food', {
      cache: createRecommendationSessionCache(),
      subcategory: 'hotpot',
    });

    expect(page.source).toBe('seed');
    expect(page.results.length).toBeGreaterThanOrEqual(3);
  });

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
    const placesPanel = readFileSync(resolve(process.cwd(), 'src/components/TripPlacesPanel.tsx'), 'utf8');
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
    expect(source).toContain('onAddedToItinerary');
    expect(source).toContain('onAddToBucket');
    expect(source).toContain('收藏');
    expect(source).toContain('已帶入');
    expect(placesPanel).toContain('onAddedToItinerary');
    expect(placesPanel).toContain('onAddToBucket');
    expect(placesPanel).toContain('handleRecommendationSaveToBucket');
    expect(placesPanel).toContain('createTripPlace');
    expect(placesPanel).toContain('await onChanged()');
  });

  it('provides Japan destination inspiration cards with coordinates', () => {
    const curated = getCuratedRecommendations('日本 JP');
    expect(curated.map((place) => place.title)).toEqual(expect.arrayContaining(['道頓堀', '黑門市場', '大阪城公園', '大阪燒美津の']));
    expect(curated.every((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))).toBe(true);
  });

  it('filters recommendation results to the requested country and city', () => {
    const japan = normalizeGlobalPlace({ id: 'osaka', title: 'Osaka Castle', displayName: 'Osaka, Japan', latitude: 34.6873, longitude: 135.5262, provider: 'google' });
    const taiwan = normalizeGlobalPlace({ id: 'taipei', title: 'Japanese Cafe', displayName: 'Linsen Road, Taipei, Taiwan', latitude: 25.0478, longitude: 121.517, provider: 'google' });

    expect(filterGlobalRecommendationsByDestination([japan, taiwan], '日本 JP')).toEqual([japan]);
    expect(filterGlobalRecommendationsByDestination([japan, taiwan], '大阪')).toEqual([japan]);
  });

  it('honours provider country codes before coordinate fallback', () => {
    const japanesePlace = normalizeGlobalPlace({ id: 'jp-1', title: 'Landmark', displayName: 'Landmark', countryCode: 'JP', latitude: 0, longitude: 0, provider: 'google' });
    const taiwanesePlace = normalizeGlobalPlace({ id: 'tw-1', title: 'Japanese Cafe', displayName: 'Japanese Cafe', countryCode: 'TW', latitude: 35.6, longitude: 139.7, provider: 'google' });

    expect(filterGlobalRecommendationsByDestination([japanesePlace, taiwanesePlace], '日本 JP')).toEqual([japanesePlace]);
  });

  it('filters injected Places results before returning destination recommendations', async () => {
    const provider = async (): Promise<GeocodingResult[]> => [
      { id: 'osaka', title: 'Osaka Castle', displayName: 'Osaka, Japan', latitude: 34.6873, longitude: 135.5262, provider: 'google' },
      { id: 'taipei', title: 'Japanese Cafe', displayName: 'Linsen Road, Taipei, Taiwan', latitude: 25.0478, longitude: 121.517, provider: 'google' },
    ];
    await expect(searchDynamicRecommendations('日本 JP', 'food', provider)).resolves.toEqual([
      expect.objectContaining({ id: 'osaka' }),
    ]);
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

  it('builds deep food and sightseeing subcategory queries', () => {
    expect(getRecommendationSubcategories('food').map((item) => item.id)).toEqual(['all', 'bbq', 'hotpot', 'noodles', 'izakaya', 'dessert']);
    expect(getRecommendationSubcategories('must-see').map((item) => item.id)).toEqual(['all', 'landmark', 'shrine', 'nature', 'shopping']);
    expect(buildRecommendationQuery('東京', 'food', 'bbq')).toContain('燒肉');
    expect(buildRecommendationQuery('大阪', 'food', 'hotpot')).toMatch(/火鍋.*涮涮鍋.*壽喜燒.*shabu.*sukiyaki.*しゃぶしゃぶ.*すき焼き/);
    expect(buildExpandedRecommendationQuery('大阪', 'food', 'bbq', 0)).toContain('熱門燒肉');
    expect(buildRecommendationQuery('東京', 'must-see', 'shrine')).toContain('神社');
  });

  it('filters live food results to the selected noodles subcategory', async () => {
    const provider = async (): Promise<GeocodingResult[]> => [
      { id: 'dotonbori', title: '道頓堀', displayName: '道頓堀, 大阪府大阪市, 日本', latitude: 34.6687, longitude: 135.5013, provider: 'google' },
      { id: 'castle', title: '大阪城公園', displayName: '大阪城公園, 大阪府大阪市, 日本', latitude: 34.6873, longitude: 135.5262, provider: 'google' },
      { id: 'yakiniku', title: '大阪焼肉店', displayName: '大阪焼肉店, 大阪府大阪市, 日本', latitude: 34.67, longitude: 135.51, provider: 'google' },
      { id: 'ramen', title: 'Ramen Kamo', displayName: 'Ramen Kamo, Osaka, Japan', latitude: 34.67, longitude: 135.51, provider: 'google' },
      { id: 'udon', title: 'うどん道場', displayName: 'うどん道場, 大阪府大阪市, 日本', latitude: 34.67, longitude: 135.51, provider: 'google' },
    ];

    await expect(searchDynamicRecommendations('日本 JP 大阪', 'food', provider, 'noodles')).resolves.toEqual([
      expect.objectContaining({ id: 'ramen' }),
      expect.objectContaining({ id: 'udon' }),
    ]);
  });

  it('filters curated cards before the panel merges them into a selected subcategory', () => {
    const curated = getCuratedRecommendations('日本 JP 大阪');
    expect(filterGlobalRecommendationsBySubcategory(curated, 'food', 'noodles')).toEqual([]);
    const panelSource = readFileSync(resolve(process.cwd(), 'src/components/RecommendationPanel.tsx'), 'utf8');
    expect(panelSource).not.toContain('mergeRecommendationResults(curated, firstPage.results)');
  });

  it('broadens a sparse subcategory page after strict filtering', async () => {
    const calls: string[] = [];
    const provider = async (query: string): Promise<{ results: GeocodingResult[]; nextPageToken: null }> => {
      calls.push(query);
      if (calls.length === 1) return {
        results: [{ id: 'one', title: '大阪のラーメン', displayName: '大阪のラーメン, Osaka, Japan', latitude: 34.67, longitude: 135.51, provider: 'google' }],
        nextPageToken: null,
      };
      return {
        results: [
          { id: 'two', title: '道頓堀美食', displayName: '道頓堀美食, Osaka, Japan', latitude: 34.67, longitude: 135.51, provider: 'google' },
          { id: 'three', title: '大阪城公園', displayName: '大阪城公園, Osaka, Japan', latitude: 34.68, longitude: 135.52, provider: 'google' },
          { id: 'four', title: '大阪の烏龍麵', displayName: '大阪の烏龍麵, Osaka, Japan', latitude: 34.67, longitude: 135.51, provider: 'google' },
        ],
        nextPageToken: null,
      };
    };

    const page = await searchDynamicRecommendationsPage('大阪', 'food', { provider, subcategory: 'noodles' });
    expect(calls).toHaveLength(2);
    expect(page.results.length).toBeGreaterThanOrEqual(3);
    console.log('fallback labels', page.results.map((place) => place.title));
    expect(page.results.map((place) => place.id)).toEqual(expect.arrayContaining(['one', 'two', 'three', 'four']));
  });

  it('supports an explicit expansion query for subsequent recommendation pages', async () => {
    const calls: string[] = [];
    const provider = async (query: string): Promise<{ results: GeocodingResult[]; nextPageToken: null }> => {
      calls.push(query);
      return { results: [{ id: `place-${calls.length}`, title: '大阪燒肉', displayName: '大阪燒肉, Osaka, Japan', latitude: 34.67, longitude: 135.51, provider: 'google' }], nextPageToken: null };
    };
    await searchDynamicRecommendationsPage('大阪', 'food', { provider, subcategory: 'bbq', queryOverride: '大阪 熱門燒肉' });
    expect(calls).toEqual(['大阪 熱門燒肉']);
  });

  it('keeps local recommendations visible when the live provider fails', async () => {
    const failingProvider = async (): Promise<never> => {
      throw new Error('Places API 400');
    };

    const page = await searchDynamicRecommendationsPage('大阪', 'food', {
      provider: failingProvider,
    });

    expect(page.results.length).toBeGreaterThanOrEqual(6);
  });

  it('uses human-readable local seed names instead of numbered template labels', async () => {
    const page = await searchDynamicRecommendationsPage('日本JP', 'food', {
      provider: async () => { throw new Error('offline'); },
      subcategory: 'noodles',
    });

    expect(page.results.length).toBeGreaterThanOrEqual(3);
    expect(page.results.every((place) => !/拉麵\d+|推薦\d+/.test(place.title))).toBe(true);
    expect(page.results.map((place) => place.title)).toEqual(expect.arrayContaining([
      expect.stringMatching(/一蘭/),
    ]));
  });

  it('keeps API results and offline seeds on separate paths', async () => {
    const apiResult = {
      id: 'api-real-place',
      title: '一蘭 道頓堀店',
      displayName: '一蘭 道頓堀店, Osaka, Japan',
      latitude: 34.6687,
      longitude: 135.5013,
      provider: 'google' as const,
    };
    const page = await searchDynamicRecommendationsPage('大阪', 'food', {
      provider: async () => ({ results: [apiResult], nextPageToken: null }),
      cache: createRecommendationSessionCache(),
    });
    expect(page.results.map((place) => place.title)).toEqual(['一蘭 道頓堀店']);
    const seeds = getLocalRecommendationFallback('日本 JP 大阪', 'food', 'hotpot');
    expect(seeds.length).toBeGreaterThanOrEqual(6);
    expect(seeds.every((place) => !/JP|在地|餐廳|食堂|推薦/.test(place.title))).toBe(true);
    const panelSource = readFileSync(resolve(process.cwd(), 'src/components/RecommendationPanel.tsx'), 'utf8');
    expect(panelSource).not.toContain('mergeRecommendationResults(curated, firstPage.results)');
  });

  it('keeps seed fallback inside the selected city and guarantees a full first page', () => {
    const osaka = getLocalRecommendationFallback('大阪', 'food', 'noodles');
    const tokyo = getLocalRecommendationFallback('東京', 'food', 'noodles');
    expect(osaka.length).toBeGreaterThanOrEqual(6);
    expect(tokyo.length).toBeGreaterThanOrEqual(6);
    expect(osaka.every((place) => place.city === '大阪' && !place.address.includes('東京'))).toBe(true);
    expect(tokyo.every((place) => place.city === '東京' && !place.address.includes('大阪'))).toBe(true);
  });

  it('preserves API and curated image URLs for recommendation cards', () => {
    const normalized = normalizeGlobalPlace({
      id: 'photo-place',
      title: 'Photo Place',
      displayName: 'Photo Place, Osaka, Japan',
      latitude: 34.67,
      longitude: 135.51,
      imageUrl: 'https://images.example/photo.jpg',
      provider: 'google',
    });
    expect(normalized.imageUrl).toBe('https://images.example/photo.jpg');
    expect(getCuratedRecommendations('日本 JP 大阪').every((place) => place.imageUrl)).toBe(true);
    const panelSource = readFileSync(resolve(process.cwd(), 'src/components/RecommendationPanel.tsx'), 'utf8');
    expect(panelSource).toContain('resizeMode="cover"');
    expect(panelSource).toContain('onError');
    expect(panelSource).toContain('recommendationSkeleton');
    expect(panelSource).toContain('buildExpandedRecommendationQuery');
    expect(panelSource).toContain('recommendationRequestId');
  });

  it('paginates recommendation cards with stable page boundaries', () => {
    const results = Array.from({ length: 13 }, (_, index) => ({ id: String(index) }));
    expect(paginateRecommendations(results, 1, 6)).toMatchObject({ page: 1, totalPages: 3, items: results.slice(0, 6), hasPrevious: false, hasNext: true });
    expect(paginateRecommendations(results, 99, 6)).toMatchObject({ page: 3, totalPages: 3, items: results.slice(12), hasPrevious: true, hasNext: false });
  });

  it('exposes modal, subcategory and pagination controls in the recommendation panel', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/RecommendationPanel.tsx'), 'utf8');
    expect(source).toContain('<Modal');
    expect(source).toContain('setIsOpen');
    expect(source).toContain('getRecommendationSubcategories');
    expect(source).toContain('paginateRecommendations');
    expect(source).toContain('上一頁');
    expect(source).toContain('下一頁');
  });
});
