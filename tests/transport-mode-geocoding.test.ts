import { describe, expect, it } from 'vitest';
import { getGoogleMapsNavigationUrl } from '../lib/map-links';
import { resolveMissingRouteCoordinates } from '../lib/route-geocoding';

describe('multi-modal route navigation', () => {
  const place = {
    title: '大國町 Airbnb',
    latitude: 25.01,
    longitude: 121.46,
  };

  it.each([
    ['TRANSIT', 'r'],
    ['WALKING', 'w'],
    ['DRIVING', 'd'],
  ] as const)('adds the %s direction flag to the navigation URL', (mode, flag) => {
    expect(getGoogleMapsNavigationUrl({ ...place, mode })).toContain(`&dirflg=${flag}`);
  });
});

describe('manual address route geocoding', () => {
  it('fills missing coordinates from a text-search resolver before routing', async () => {
    const result = await resolveMissingRouteCoordinates([
      { id: 'airbnb', location_name: '大國町 Airbnb', address: '大阪府大阪市浪速區大國町 1-2-3', latitude: null, longitude: null },
      { id: 'station', location_name: '南海難波站', address: null, latitude: 34.665, longitude: 135.501 },
    ], async (query) => query.includes('大國町')
      ? [{ latitude: 34.653, longitude: 135.498, title: '大國町' }]
      : []);

    expect(result.items[0]).toMatchObject({ latitude: 34.653, longitude: 135.498 });
    expect(result.resolvedIds).toEqual(['airbnb']);
  });

  it('keeps address-only items routeless when geocoding fails', async () => {
    const result = await resolveMissingRouteCoordinates([
      { id: 'unknown', location_name: '手動地址', address: '未知地址', latitude: null, longitude: null },
    ], async () => []);

    expect(result.items[0]).toMatchObject({ latitude: null, longitude: null });
    expect(result.resolvedIds).toEqual([]);
  });
});

