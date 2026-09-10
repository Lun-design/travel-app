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

  it('sanitizes optional form values and constrained category fields before the Supabase write', () => {
    const payload = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '戶外景點',
      category: 'trail',
      spot_type: 'outdoor' as unknown as string,
      time: '',
      address: '',
      notes: '',
      difficulty: 'invalid' as unknown as string,
      latitude: '' as unknown as number,
      longitude: '' as unknown as number,
      opening_hours: {
        monday: { closed: false, periods: [{ open: '09:00', close: '18:00' }, { open: '', close: '' }] },
        tuesday: { closed: true, periods: [{ open: '10:00', close: '12:00' }] },
      },
    });

    expect(payload).toMatchObject({
      time: null,
      address: null,
      notes: null,
      difficulty: null,
      latitude: null,
      longitude: null,
      opening_hours: {
        monday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        tuesday: { closed: true, periods: [] },
      },
    });
    expect((payload as Record<string, unknown>).spot_type).toBeUndefined();
  });

  it('falls back to a schema-safe category and difficulty for unknown values', () => {
    const payload = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '手動景點',
      category: 'unknown' as unknown as string,
      difficulty: '' as unknown as string,
    });

    expect(payload.category).toBe('spot');
    expect(payload.difficulty).toBeNull();
  });

  it('maps the legacy spot_type field to the schema category and removes the unknown column', () => {
    const payload = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '步道',
      spot_type: 'outdoor' as unknown as string,
    });

    expect(payload.category).toBe('outdoor');
    expect((payload as Record<string, unknown>).spot_type).toBeUndefined();
  });
});
