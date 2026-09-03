import { describe, expect, it } from 'vitest';
import { coordinatesForPolyline, filterAndSortItems } from '../lib/itinerary';

const items: any[] = [
  { day_number: 1, time: '14:00', latitude: 25.03, longitude: 121.56 },
  { day_number: 2, time: '09:00', latitude: 24.99, longitude: 121.30 },
  { day_number: 1, time: '09:00', latitude: 25.04, longitude: 121.55 },
  { day_number: 1, time: null, latitude: null, longitude: null },
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
});
