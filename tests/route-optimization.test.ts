import { describe, expect, it } from 'vitest';
import { applyOptimizedSchedule, optimizeRoute, type OptimizableStop } from '../lib/route-optimizer';

function stop(id: string, latitude: number, longitude: number): OptimizableStop {
  return { id, latitude, longitude };
}

describe('route optimization', () => {
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

  it('returns zero, one, or two stops without route optimization work', () => {
    for (const stops of [
      [],
      [stop('only', 25, 121)],
      [stop('a', 25, 121), stop('b', 25.01, 121.01)],
    ]) {
      const result = optimizeRoute(stops);
      expect(result.items).toBe(stops);
      expect(result.optimized).toBe(false);
      expect(result.strategy).toBe('none');
    }
  });

  it('keeps the real distance and travel leg for a two-stop route', () => {
    const stops = [stop('origin', 25.03, 121.46), stop('destination', 24.15, 120.68)];

    const result = optimizeRoute(stops);

    expect(result.items).toBe(stops);
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
});
