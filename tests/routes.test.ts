import { describe, expect, it, vi } from 'vitest';
import {
  buildGoogleMapsRouteUrl,
  calculateFallbackTravelMinutes,
  createRouteEstimator,
  routeCacheKey,
  type RoutePoint,
} from '../lib/routes';

const taipeiMainStation: RoutePoint = { latitude: 25.0478, longitude: 121.517, title: '台北車站' };
const taipei101: RoutePoint = { latitude: 25.033968, longitude: 121.564468, title: '台北 101' };

describe('route estimates', () => {
  it('uses a stable origin-destination-mode cache key', () => {
    expect(routeCacheKey(taipeiMainStation, taipei101, 'TRANSIT')).toBe('25.047800,121.517000->25.033968,121.564468:TRANSIT');
  });

  it('uses different fallback speeds for driving, transit, and walking', () => {
    const distanceKm = 2;
    const driving = calculateFallbackTravelMinutes(distanceKm, 'DRIVING');
    const transit = calculateFallbackTravelMinutes(distanceKm, 'TRANSIT');
    const walking = calculateFallbackTravelMinutes(distanceKm, 'WALKING');

    expect(driving).toBeLessThan(transit);
    expect(transit).toBeLessThan(walking);
    expect(driving).toBeGreaterThan(0);
  });

  it('calls Routes API once and reuses the cached estimate', async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1800, duration: '900s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const first = await estimator.getRoute(taipeiMainStation, taipei101, 'TRANSIT');
    const second = await estimator.getRoute(taipeiMainStation, taipei101, 'TRANSIT');

    expect(first).toMatchObject({ distanceKm: 1.8, durationMinutes: 15, mode: 'TRANSIT', source: 'google' });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body).toMatchObject({
      origin: { location: { latLng: { latitude: 25.0478, longitude: 121.517 } } },
      destination: { location: { latLng: { latitude: 25.033968, longitude: 121.564468 } } },
      travelMode: 'TRANSIT',
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    });
  });

  it('filters invalid coordinates before sending a Routes API request', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 100, duration: '60s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute({ title: '缺少座標的景點' }, taipei101, 'DRIVING');

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('fallback');
  });

  it('logs the full error body and falls back on a 400 response', async () => {
    const responseBody = JSON.stringify({
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Invalid latLng',
        details: [{ field: 'origin.location.latLng.latitude' }],
      },
    });
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => responseBody,
    }) as unknown as Response);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute(taipeiMainStation, taipei101, 'TRANSIT');

    expect(result.source).toBe('fallback');
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Routes] API request failed',
      expect.objectContaining({ status: 400, body: responseBody }),
    );
  });

  it('falls back to geometry when Routes API is unavailable', async () => {
    const estimator = createRouteEstimator({
      apiKey: 'test-key',
      fetcher: vi.fn(async () => { throw new Error('offline'); }),
    });

    const result = await estimator.getRoute(taipeiMainStation, taipei101, 'WALKING');

    expect(result.source).toBe('fallback');
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.durationMinutes).toBe(calculateFallbackTravelMinutes(result.distanceKm, 'WALKING'));
  });

  it('builds a Google Maps route URL for each supported travel mode', () => {
    expect(buildGoogleMapsRouteUrl(taipeiMainStation, taipei101, 'DRIVING')).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=25.0478%2C121.517&destination=25.033968%2C121.564468&travelmode=driving',
    );
    expect(buildGoogleMapsRouteUrl(taipeiMainStation, taipei101, 'TRANSIT')).toContain('&travelmode=transit');
    expect(buildGoogleMapsRouteUrl(taipeiMainStation, taipei101, 'WALKING')).toContain('&travelmode=walking');
  });
});
