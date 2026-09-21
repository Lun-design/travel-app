import { describe, expect, it, vi } from 'vitest';
import {
  buildGoogleMapsRouteUrl,
  calculateFallbackTravelMinutes,
  createRouteEstimator,
  estimateRouteSequence,
  formatRouteEstimateDuration,
  routeCacheKey,
  sanitizeRouteEstimateForDisplay,
  type RoutePoint,
} from '../lib/routes';

const taipeiMainStation: RoutePoint = { latitude: 25.0478, longitude: 121.517, title: '台北車站' };
const taipei101: RoutePoint = { latitude: 25.033968, longitude: 121.564468, title: '台北 101' };

describe('route estimates', () => {
  it('never renders a stale one-minute label for a 35.5 km route', () => {
    const label = formatRouteEstimateDuration({ distanceMeters: 35_500, durationMinutes: 1 }, 'DRIVING');

    expect(label).toBe('53 分鐘');
    expect(label).not.toContain('1 分鐘');
  });

  it('corrects a stale long duration for a sub-kilometre route at render time', () => {
    expect(formatRouteEstimateDuration({ distanceMeters: 478, durationMinutes: 61 }, 'DRIVING')).toBe('6 分鐘');
  });

  it('uses a stable origin-destination-mode cache key', () => {
    expect(routeCacheKey(taipeiMainStation, taipei101, 'TRANSIT')).toBe('25.047800,121.517000->25.033968,121.564468:TRANSIT');
  });

  it('keeps reverse directions isolated in the route cache', () => {
    expect(routeCacheKey(taipeiMainStation, taipei101, 'DRIVING'))
      .not.toBe(routeCacheKey(taipei101, taipeiMainStation, 'DRIVING'));
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
    expect(body.routeModifiers).toBeUndefined();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
    });
  });

  it('converts Routes API duration seconds and distance meters exactly once', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 133300, duration: '7200s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute(taipeiMainStation, taipei101, 'DRIVING');

    expect(result.source).toBe('google');
    expect(result.distanceKm).toBeCloseTo(133.3, 6);
    expect(result.durationMinutes).toBe(120);
  });

  it('falls back when a long driving route is reported as an impossible one-minute trip', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 35_500, duration: '60s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute(
      { latitude: 34.434, longitude: 135.244, title: '關西機場' },
      { latitude: 34.665, longitude: 135.501, title: '南海難波站' },
      'DRIVING',
    );

    expect(result.source).toBe('fallback');
    expect(result.distanceKm).toBeGreaterThan(30);
    expect(result.durationMinutes).toBe(calculateFallbackTravelMinutes(result.distanceKm, 'DRIVING'));
    expect(result.durationMinutes).toBeGreaterThan(10);
  });

  it('falls back when a short driving route is reported as an hour-long trip', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 478, duration: '3660s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute(
      { latitude: 34.665, longitude: 135.501, title: '南海難波站' },
      { latitude: 34.6693, longitude: 135.501, title: '黑門市場' },
      'DRIVING',
    );

    expect(result.source).toBe('fallback');
    expect(result.distanceKm).toBeCloseTo(0.478, 2);
    expect(result.durationMinutes).toBe(calculateFallbackTravelMinutes(result.distanceKm, 'DRIVING'));
    expect(result.durationMinutes).toBeLessThan(30);
  });

  it('sanitizes a cached long-distance one-minute estimate before UI rendering', () => {
    const sanitized = sanitizeRouteEstimateForDisplay({
      distanceKm: 35.5,
      durationMinutes: 1,
      mode: 'DRIVING',
      source: 'google',
      navigationUrl: null,
    }, 35.5, 'DRIVING');

    expect(sanitized.source).toBe('fallback');
    expect(sanitized.durationMinutes).toBe(53);
    expect(sanitized.durationMinutes).toBeGreaterThan(5);
  });

  it('sanitizes a cached sub-kilometre sixty-one-minute estimate before UI rendering', () => {
    const sanitized = sanitizeRouteEstimateForDisplay({
      distanceKm: 0.478,
      durationMinutes: 61,
      mode: 'DRIVING',
      source: 'google',
      navigationUrl: null,
    }, 0.478, 'DRIVING');

    expect(sanitized.source).toBe('fallback');
    expect(sanitized.durationMinutes).toBe(6);
    expect(sanitized.durationMinutes).toBeLessThan(40);
  });

  it('invalidates a stale cached estimate that fails the duration sanity check', async () => {
    const origin = { latitude: 25.01, longitude: 121.46, title: '南海難波站' };
    const destination = { latitude: 25.02, longitude: 121.47, title: '黑門市場' };
    const cache = new Map<string, any>([[routeCacheKey(origin, destination, 'DRIVING'), {
      distanceKm: 35.5,
      durationMinutes: 1,
      legs: [{ distanceKm: 35.5, durationMinutes: 1 }],
      mode: 'DRIVING',
      source: 'google',
      navigationUrl: null,
    }]]);
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 35_500, duration: '3600s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher, cache });

    const result = await estimator.getRoute(origin, destination, 'DRIVING');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('google');
    expect(result.durationMinutes).toBe(60);
  });

  it('invalidates an impossible cached sequence leg before rendering it', async () => {
    const points = [
      { latitude: 34.434, longitude: 135.244, title: '關西機場' },
      { latitude: 34.665, longitude: 135.501, title: '南海難波站' },
    ];
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 35_500, duration: '3600s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });
    estimator.sequenceCache.set('DRIVING:34.434000,135.244000>34.665000,135.501000', {
      legs: [{ distanceKm: 35.5, durationMinutes: 1, mode: 'DRIVING', source: 'google', navigationUrl: null }],
      totalDistanceKm: 35.5,
      totalDurationMinutes: 1,
    });

    const result = await estimator.getRouteSequence(points, 'DRIVING');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.totalDurationMinutes).toBe(60);
  });

  it('aggregates every response leg instead of using only a partial route total', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{
        distanceMeters: 999,
        duration: '999s',
        legs: [
          { distanceMeters: 1000, duration: '60s' },
          { distanceMeters: 2000, duration: '120s' },
        ],
      }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute(taipeiMainStation, taipei101, 'DRIVING');

    expect(result.distanceKm).toBeCloseTo(3, 6);
    expect(result.durationMinutes).toBe(3);
    expect(result.legs).toEqual([
      { distanceKm: 1, durationMinutes: 1 },
      { distanceKm: 2, durationMinutes: 2 },
    ]);
  });

  it('sums each adjacent leg for a multi-stop route sequence', async () => {
    const responses = [
      { distanceMeters: 1000, duration: '60s' },
      { distanceMeters: 2500, duration: '150s' },
    ];
    let requestIndex = 0;
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [responses[requestIndex++] ?? responses[0]] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });
    const sequence = await estimateRouteSequence([taipeiMainStation, taipei101, { latitude: 25.01, longitude: 121.5 }], 'DRIVING', estimator);

    expect(sequence.totalDistanceKm).toBeCloseTo(3.5, 6);
    expect(sequence.totalDurationMinutes).toBe(4);
    expect(sequence.legs).toHaveLength(2);
  });

  it('translates app travel modes to the Routes API v2 enum values', async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1000, duration: '120s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    await estimator.getRoute(taipeiMainStation, taipei101, 'DRIVING');
    await estimator.getRoute(taipeiMainStation, taipei101, 'WALKING');

    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(firstBody.travelMode).toBe('DRIVE');
    expect(secondBody.travelMode).toBe('WALK');
    expect(firstBody.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(firstBody.routeModifiers).toBeUndefined();
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

  it('treats the 0,0 placeholder as missing instead of routing from the Gulf of Guinea', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 100, duration: '60s' }] }),
    }) as unknown as Response);
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });

    const result = await estimator.getRoute({ latitude: 0, longitude: 0, title: 'Airport' }, taipei101, 'DRIVING');

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.source).toBe('fallback');
    expect(result.distanceKm).toBe(0);
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
    const transitUrl = buildGoogleMapsRouteUrl(taipeiMainStation, taipei101, 'TRANSIT');
    expect(transitUrl).toContain('origin=25.0478%2C121.517');
    expect(transitUrl).toContain('destination=25.033968%2C121.564468');
    expect(transitUrl).toContain('&travelmode=transit');
    expect(buildGoogleMapsRouteUrl(taipeiMainStation, taipei101, 'WALKING')).toContain('&travelmode=walking');
  });
});
