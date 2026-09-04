import { describe, expect, it } from 'vitest';
import { normalizeItineraryItemPayload } from '../lib/itinerary';

describe('normalizeItineraryItemPayload', () => {
  it('normalizes AI/form values before writing the itinerary item', () => {
    const openingHours = {
      saturday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
    };

    const payload = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      day_number: 2.8,
      location_name: '台北 101',
      category: 'spot',
      time: '08:30:00',
      duration_minutes: '90' as unknown as number,
      opening_hours: openingHours,
    });

    expect(payload).toMatchObject({
      trip_id: 'trip-1',
      created_by: 'user-1',
      day_number: 2,
      time: '08:30',
      duration_minutes: 90,
      opening_hours: openingHours,
    });
  });

  it('keeps omitted optional fields omitted for partial updates', () => {
    const payload = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      id: 'item-1',
      notes: '更新備註',
    });

    expect(payload).toEqual({
      trip_id: 'trip-1',
      created_by: 'user-1',
      id: 'item-1',
      notes: '更新備註',
    });
  });
});
