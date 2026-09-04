import { describe, expect, it } from 'vitest';
import {
  buildRouteSegments,
  coordinatesForPolyline,
  filterAndSortItems,
  haversineDistanceKm,
  mapMarkersForDay,
  reorderItineraryItems,
} from '../lib/itinerary';

const items: any[] = [
  { id: 'afternoon', location_name: '下午景點', day_number: 1, time: '14:00', latitude: 25.03, longitude: 121.56 },
  { id: 'other-day', location_name: '其他天', day_number: 2, time: '09:00', latitude: 24.99, longitude: 121.30 },
  { id: 'morning', location_name: '上午景點', day_number: 1, time: '09:00', latitude: 25.04, longitude: 121.55 },
  { id: 'no-location', location_name: '尚未定位', day_number: 1, time: null, latitude: null, longitude: null },
];

describe('itinerary helpers', () => {
  it('filters a day and sorts timed items first', () => {
    expect(filterAndSortItems(items, 1).map((x) => x.time)).toEqual(['09:00', '14:00', null]);
  });
  it('returns only complete coordinates in order', () => {
    expect(coordinatesForPolyline(items, 1)).toEqual([
      { latitude: 25.04, longitude: 121.55 },
      { latitude: 25.03, longitude: 121.56 },
    ]);
  });

  it('calculates Haversine distance in kilometres', () => {
    const taipei101 = { latitude: 25.033968, longitude: 121.564468 };
    const taipeiMainStation = { latitude: 25.0478, longitude: 121.517 };

    expect(haversineDistanceKm(taipei101, taipeiMainStation)).toBeCloseTo(5.02, 1);
  });

  it('converts located attractions into numbered map markers', () => {
    expect(mapMarkersForDay(items, 1)).toEqual([
      expect.objectContaining({ id: 'morning', order: 1, title: '上午景點', latitude: 25.04, longitude: 121.55 }),
      expect.objectContaining({ id: 'afternoon', order: 2, title: '下午景點', latitude: 25.03, longitude: 121.56 }),
    ]);
  });

  it('builds an estimated travel segment between consecutive located attractions', () => {
    const segments = buildRouteSegments(items, 1);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(expect.objectContaining({ fromId: 'morning', toId: 'afternoon' }));
    expect(segments[0].distanceKm).toBeGreaterThan(0);
    expect(segments[0].estimatedDriveMinutes).toBeGreaterThan(0);
  });

  it('reorders items without mutating input and normalizes positions', () => {
    const ordered = [
      { id: 'a', position: 4 },
      { id: 'b', position: 8 },
      { id: 'c', position: 12 },
    ] as any[];

    expect(reorderItineraryItems(ordered, 0, 2).map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'b', position: 0 },
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
    ]);
    expect(ordered.map((item) => item.position)).toEqual([4, 8, 12]);
  });

  it('ignores invalid reorder indexes', () => {
    const ordered = [{ id: 'a', position: 0 }] as any[];
    expect(reorderItineraryItems(ordered, -1, 0)).toBe(ordered);
    expect(reorderItineraryItems(ordered, 0, 2)).toBe(ordered);
  });
});
