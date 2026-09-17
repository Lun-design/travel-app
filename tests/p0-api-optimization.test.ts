import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

describe('P0 weather batching', () => {
  it('fetches a day/coordinate batch once and reuses the keyed result', async () => {
    const { createWeatherService } = await import('../lib/weather-api');
    const payloadFor = (temperature: number) => ({
      hourly: {
        time: ['2026-01-22T10:00'],
        temperature_2m: [temperature],
        precipitation_probability: [0],
        precipitation: [0],
        weather_code: [0],
      },
      daily: {
        time: ['2026-01-22'],
        temperature_2m_min: [temperature - 5],
        temperature_2m_max: [temperature + 5],
        precipitation_probability_max: [0],
        precipitation_sum: [0],
        weather_code: [0],
      },
      current: { temperature_2m: temperature, weather_code: 0, precipitation: 0 },
    });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify([payloadFor(20), payloadFor(22)]), { status: 200 }));
    const service = createWeatherService(fetcher, { today: () => '2026-01-20' });
    const locations = [
      { id: 'a', latitude: 25.03, longitude: 121.56 },
      { id: 'b', latitude: 25.04, longitude: 121.57 },
    ];

    const first = await service.getForecastBatch(locations, '2026-01-22', 'Asia/Taipei');
    const second = await service.getForecastBatch(locations, '2026-01-22', 'Asia/Taipei');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.a?.currentTemperatureC).toBe(20);
    expect(first.b?.currentTemperatureC).toBe(22);
    expect(second).toEqual(first);
    const requestUrl = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(requestUrl.searchParams.get('latitude')).toBe('25.03000,25.04000');
    expect(requestUrl.searchParams.get('longitude')).toBe('121.56000,121.57000');
  });

  it('deduplicates identical coordinates in a batch while preserving both ids', async () => {
    const { createWeatherService } = await import('../lib/weather-api');
    const payload = {
      daily: { time: ['2026-01-22'], temperature_2m_min: [15], temperature_2m_max: [24], precipitation_probability_max: [0], weather_code: [0] },
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), { status: 200 }));
    const service = createWeatherService(fetcher, { today: () => '2026-01-20' });

    const result = await service.getForecastBatch([
      { id: 'a', latitude: 25.03, longitude: 121.56 },
      { id: 'b', latitude: 25.03, longitude: 121.56 },
    ], '2026-01-22');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.a).toEqual(result.b);
  });

  it('batches a day route into one Routes API request with intermediate stops', async () => {
    const { createRouteEstimator } = await import('../lib/routes');
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => new Response(JSON.stringify({ routes: [{
      distanceMeters: 3000,
      duration: '180s',
      legs: [
        { distanceMeters: 1000, duration: '60s' },
        { distanceMeters: 2000, duration: '120s' },
      ],
    }] }), { status: 200 }));
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });
    const points = [
      { latitude: 25.03, longitude: 121.56, title: 'A' },
      { latitude: 25.04, longitude: 121.57, title: 'B' },
      { latitude: 25.05, longitude: 121.58, title: 'C' },
    ];

    const [result, second] = await Promise.all([
      estimator.getRouteSequence(points, 'DRIVING'),
      estimator.getRouteSequence(points, 'DRIVING'),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.legs).toHaveLength(2);
    expect(result.totalDistanceKm).toBeCloseTo(3, 6);
    expect(result.totalDurationMinutes).toBe(3);
    expect(second).toEqual(result);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.intermediates).toEqual([{ location: { latLng: { latitude: 25.04, longitude: 121.57 } } }]);
  });
});

describe('P0 itinerary order transaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses one RPC transaction instead of one PATCH per item', async () => {
    const { updateItineraryItemsOrder } = await import('../lib/itinerary-api');
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const order = [
      { id: 'item-a', position: 1 },
      { id: 'item-b', position: 0 },
    ];

    await updateItineraryItemsOrder(order, { offlineScope: { userId: 'user-1', tripId: 'trip-1' } });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('update_itinerary_items_order', { p_items: order });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
