import { describe, expect, it } from 'vitest';
import { applyOptimizedSchedule, optimizeRoute, replaceOptimizedRouteItems, type OptimizableStop } from '../lib/route-optimizer';
import { optimizeItineraryOrder, preserveItineraryTimes, type ItineraryOptimizationStop } from '../lib/route-optimization';

function stop(id: string, latitude: number, longitude: number): OptimizableStop {
  return { id, latitude, longitude };
}

describe('route optimization', () => {
  it('reorders an unordered day into a geographically efficient route while keeping the first stop fixed', () => {
    const result = optimizeItineraryOrder([
      { id: 'taipei', latitude: 25.033, longitude: 121.565, duration_minutes: 30, start_time: '09:00' },
      { id: 'tainan', latitude: 22.997, longitude: 120.213, duration_minutes: 60, start_time: '10:00' },
      { id: 'xin-zhuang', latitude: 25.036, longitude: 121.45, duration_minutes: 45, start_time: '11:00' },
    ]);

    expect(result.items.map((item) => item.id)).toEqual(['taipei', 'xin-zhuang', 'tainan']);
    expect(result.items[0]?.id).toBe('taipei');
    expect(result.totalDistanceKm).toBeLessThan(result.originalDistanceKm);
    expect(result.items.every((item) => typeof item.start_time === 'string')).toBe(true);
    expect(Object.fromEntries(result.items.map((item) => [item.id, item.start_time]))).toEqual({
      taipei: '09:00',
      'xin-zhuang': '11:00',
      tainan: '10:00',
    });
  });

  it('preserves every original start time by default when applying an optimized order', () => {
    const original = [
      { id: 'first', latitude: 25.033, longitude: 121.565, time: '09:00' },
      { id: 'far', latitude: 22.997, longitude: 120.213, time: '13:00' },
      { id: 'near', latitude: 25.036, longitude: 121.45, time: '10:00' },
    ];

    const result = optimizeItineraryOrder(original);

    expect(result.items.map((item) => item.id)).toEqual(['first', 'near', 'far']);
    expect(result.items.map((item) => item.time)).toEqual(['09:00', '10:00', '13:00']);
  });

  it('only recalculates start times when explicitly requested', () => {
    const original = [
      { id: 'first', latitude: 25.033, longitude: 121.565, time: '09:00', duration_minutes: 60 },
      { id: 'near', latitude: 25.036, longitude: 121.45, time: '18:00', duration_minutes: 60 },
      { id: 'far', latitude: 22.997, longitude: 120.213, time: '20:00', duration_minutes: 60 },
    ];

    const result = optimizeItineraryOrder(original, { recalculateStartTimes: true });

    expect(result.items.map((item) => item.time)).not.toEqual(['09:00', '18:00', '20:00']);
  });

  it('preserves persisted times when applying an order-only payload', () => {
    const original = [
      { id: 'a', time: '09:00', start_time: '09:00', position: 0 },
      { id: 'b', time: '10:00', start_time: '10:00', position: 1 },
    ];
    const reordered = [
      { id: 'b', time: '09:42', start_time: '09:42', position: 0 },
      { id: 'a', time: '10:42', start_time: '10:42', position: 1 },
    ];

    const next = preserveItineraryTimes(original, reordered);

    expect(next).toEqual([
      { id: 'b', time: '10:00', start_time: '10:00', position: 0 },
      { id: 'a', time: '09:00', start_time: '09:00', position: 1 },
    ]);
  });

  it('keeps a fixed-time reservation at its original slot and preserves its start time', () => {
    const result = optimizeItineraryOrder([
      { id: 'taipei', latitude: 25.033, longitude: 121.565, duration_minutes: 30, start_time: '09:00' },
      { id: 'reservation', latitude: 22.997, longitude: 120.213, duration_minutes: 60, start_time: '12:00' },
      { id: 'xin-zhuang', latitude: 25.036, longitude: 121.45, duration_minutes: 45, start_time: '13:00' },
      { id: 'keelung', latitude: 25.128, longitude: 121.74, duration_minutes: 45, start_time: '14:00' },
    ], { fixedTimeAnchors: [{ id: 'reservation', start_time: '12:00' }] });

    expect(result.items.map((item) => item.id).indexOf('reservation')).toBe(1);
    expect(result.items.find((item) => item.id === 'reservation')?.start_time).toBe('12:00');
  });

  it('can optimize the full route when the first destination is not fixed', () => {
    const result = optimizeItineraryOrder([
      { id: 'origin', latitude: 25.033, longitude: 121.565, duration_minutes: 30 },
      { id: 'tainan', latitude: 22.997, longitude: 120.213, duration_minutes: 30 },
      { id: 'xin-zhuang', latitude: 25.036, longitude: 121.45, duration_minutes: 30 },
    ], {
      fixFirstDestination: false,
      distanceMatrix: [
        [0, 10, 10],
        [10, 0, 100],
        [10, 100, 0],
      ],
    });

    expect(result.items.map((item) => item.id)).toEqual(['tainan', 'origin', 'xin-zhuang']);
    expect(result.items[0]?.id).not.toBe('origin');
  });

  it('returns the original order for zero, one, and two stops', () => {
    const cases: readonly (readonly ItineraryOptimizationStop[])[] = [
      [],
      [{ id: 'only', latitude: 25, longitude: 121 }],
      [
        { id: 'first', latitude: 25, longitude: 121 },
        { id: 'second', latitude: 25.01, longitude: 121.01 },
      ],
    ];

    cases.forEach((items) => {
      const result = optimizeItineraryOrder(items);
      expect(result.items).toEqual(items);
      expect(result.strategy).toBe('none');
      expect(result.optimized).toBe(false);
    });
  });

  it('uses original item indexes when evaluating an array distance matrix after reordering', () => {
    const matrix = [
      [0, 100, 1],
      [100, 0, 100],
      [1, 100, 0],
    ];
    const result = optimizeItineraryOrder([
      { id: 'first', latitude: 25, longitude: 121 },
      { id: 'far', latitude: 25.01, longitude: 121.01 },
      { id: 'near', latitude: 25.02, longitude: 121.02 },
    ], { distanceMatrix: matrix });

    expect(result.items.map((item) => item.id)).toEqual(['first', 'near', 'far']);
    expect(result.totalDistanceKm).toBe(101);
  });

  it('keeps the first stop fixed and finds the shortest order for the remaining stops', () => {
    const stops = [
      stop('start', 0, 0),
      stop('far-east', 1, 0),
      stop('nearby', 0, 0.01),
      stop('east-nearby', 1, 0.01),
    ];

    const result = optimizeRoute(stops);

    expect(result.items.map((item) => item.id)).toEqual(['start', 'nearby', 'east-nearby', 'far-east']);
    expect(result.items[0]).toBe(stops[0]);
    expect(result.strategy).toBe('exact');
    expect(result.totalDistanceKm).toBeLessThan(120);
    expect(result.originalDistanceKm - result.totalDistanceKm).toBeGreaterThan(0);
    expect(result.originalDurationMinutes).toBeGreaterThan(result.totalDurationMinutes);
  });

  it('can optimize every stop when the first destination is not fixed', () => {
    const stops = [
      stop('origin', 0, 0),
      stop('far-east', 1, 0),
      stop('east-nearby', 1, 0.01),
      stop('nearby', 0, 0.01),
    ];

    const result = optimizeRoute(stops, { fixFirstDestination: false });

    expect(result.items.map((item) => item.id)).toEqual(['east-nearby', 'far-east', 'origin', 'nearby']);
    expect(result.items[0]).not.toBe(stops[0]);
    expect(result.totalDistanceKm).toBeLessThan(120);
  });

  it('returns zero or one stop without route optimization work', () => {
    for (const stops of [[], [stop('only', 25, 121)]]) {
      const result = optimizeRoute(stops);
      expect(result.items).toBe(stops);
      expect(result.optimized).toBe(false);
      expect(result.strategy).toBe('none');
    }
  });

  it('supports a two-stop route so the button does not silently do nothing', () => {
    const stops = [stop('a', 25, 121), stop('b', 25.01, 121.01)];
    const result = optimizeRoute(stops);
    expect(result.strategy).toBe('exact');
    expect(result.legs).toHaveLength(1);
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });

  it('returns an explicit missing-coordinates reason for the UI alert', () => {
    const result = optimizeRoute([stop('a', 25, 121), { id: 'b', latitude: null, longitude: null }]);
    expect(result.strategy).toBe('none');
    expect(result.reason).toBe('missing-coordinates');
  });

  it('keeps the real distance and travel leg for a two-stop route', () => {
    const stops = [stop('origin', 25.03, 121.46), stop('destination', 24.15, 120.68)];

    const result = optimizeRoute(stops);

    expect(result.items).toEqual(stops);
    expect(result.originalDistanceKm).toBeGreaterThan(100);
    expect(result.totalDistanceKm).toBeCloseTo(result.originalDistanceKm, 8);
    expect(result.legs).toHaveLength(1);
    expect(result.originalDurationMinutes).toBe(result.totalDurationMinutes);
    expect(result.totalDurationMinutes).toBeGreaterThan(0);
  });

  it('accepts numeric coordinate values returned as strings by a data adapter', () => {
    const stops = [
      { ...stop('origin', 25.03, 121.46), latitude: '25.03' as unknown as number, longitude: '121.46' as unknown as number },
      { ...stop('destination', 24.15, 120.68), latitude: '24.15' as unknown as number, longitude: '120.68' as unknown as number },
      stop('third', 24.2, 120.7),
    ];

    const result = optimizeRoute(stops);

    expect(result.strategy).toBe('exact');
    expect(result.reason).toBeUndefined();
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });

  it('uses nearest-neighbor for more than ten stops', () => {
    const stops = [
      stop('stop-0', 25, 121.05),
      ...Array.from({ length: 10 }, (_, index) => stop(`stop-${index + 1}`, 25, 121 + index * 0.01)),
    ];

    const result = optimizeRoute(stops);

    expect(result.items).toHaveLength(11);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(11);
    expect(result.strategy).toBe('nearest-neighbor');
    expect(result.optimized).toBe(true);
  });

  it('builds a suggested timeline using travel time and each stop duration', () => {
    const stops = [
      { ...stop('start', 25, 121), time: '09:00', duration_minutes: 30, position: 0 },
      { ...stop('next', 25, 121.01), time: null, duration_minutes: 45, position: 1 },
      { ...stop('last', 25, 121.02), time: null, duration_minutes: 60, position: 2 },
    ];
    const result = optimizeRoute(stops);

    const scheduled = applyOptimizedSchedule(result, { defaultStartTime: '09:00' });

    expect(scheduled.map((item) => item.time)).toEqual(['09:00', '09:43', '10:41']);
    expect(scheduled.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it('replaces route state with the optimized order and a new array reference', () => {
    const current = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];
    const optimized = [
      { id: 'a', position: 0 },
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ];

    const next = replaceOptimizedRouteItems(current, optimized);

    expect(next).not.toBe(current);
    expect(next.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(next[1]).not.toBe(optimized[1]);
  });
});
