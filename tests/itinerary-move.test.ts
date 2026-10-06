import { describe, expect, it } from 'vitest';
import type { ItineraryItem } from '../lib/itinerary';
import { moveItineraryItemAcrossDays } from '../lib/itinerary-move';

function item(id: string, day_number: number, position: number, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id,
    trip_id: 'trip-1',
    day_number,
    position,
    time: `${String(9 + position).padStart(2, '0')}:00`,
    location_name: id,
    address: null,
    latitude: null,
    longitude: null,
    notes: null,
    category: 'spot',
    created_by: 'user-1',
    ...overrides,
  };
}

describe('move itinerary item across days', () => {
  it('appends to the target day, compacts both positions, and preserves item details', () => {
    const items = [
      item('a', 1, 0),
      item('b', 1, 1, { time: '13:45', notes: 'Keep this note', estimated_cost: 250 }),
      item('c', 1, 2),
      item('d', 2, 0),
      item('e', 2, 1),
    ];

    const moved = moveItineraryItemAcrossDays(items, 'b', 2);

    expect([...moved].sort((left, right) => left.day_number - right.day_number || left.position - right.position).map(({ id, day_number, position }) => [id, day_number, position])).toEqual([
      ['a', 1, 0], ['c', 1, 1], ['d', 2, 0], ['e', 2, 1], ['b', 2, 2],
    ]);
    expect(moved.find(({ id }) => id === 'b')).toMatchObject({
      time: '13:45', notes: 'Keep this note', estimated_cost: 250,
    });
    expect(items.map(({ id, day_number, position }) => [id, day_number, position])).toEqual([
      ['a', 1, 0], ['b', 1, 1], ['c', 1, 2], ['d', 2, 0], ['e', 2, 1],
    ]);
  });

  it('returns the original array for a same-day move or missing item', () => {
    const items = [item('a', 1, 0), item('b', 1, 1)];

    expect(moveItineraryItemAcrossDays(items, 'a', 1)).toBe(items);
    expect(moveItineraryItemAcrossDays(items, 'missing', 2)).toBe(items);
  });

  it('can move into an empty day and rejects invalid day numbers', () => {
    const items = [item('a', 1, 0), item('b', 1, 1)];

    expect(moveItineraryItemAcrossDays(items, 'b', 3).map(({ id, day_number, position }) => [id, day_number, position])).toEqual([
      ['a', 1, 0], ['b', 3, 0],
    ]);
    expect(moveItineraryItemAcrossDays(items, 'b', 0)).toBe(items);
    expect(moveItineraryItemAcrossDays(items, 'b', 1.5)).toBe(items);
  });
});
