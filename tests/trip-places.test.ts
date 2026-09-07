import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import {
  buildItineraryItemFromPlace,
  buildScheduledPlacePatch,
  createTripPlace,
  listTripPlaces,
  type TripPlace,
} from '../lib/trip-places-api';

const place: TripPlace = {
  id: 'place-1',
  trip_id: 'trip-1',
  title: '淺草寺',
  address: '日本東京都台東區淺草 2-3-1',
  lat: 35.7148,
  lng: 139.7967,
  category: 'spot',
  notes: '早上參拜',
  status: 'saved',
  created_by: 'user-1',
  created_at: '2026-09-07T00:00:00.000Z',
};

describe('trip places API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新增與讀取靈感庫景點', async () => {
    const listQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [place], error: null }),
    };
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: place, error: null }),
    };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(insertQuery as never)
      .mockReturnValueOnce(listQuery as never);

    const created = await createTripPlace({
      trip_id: place.trip_id,
      title: place.title,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      notes: place.notes,
      created_by: place.created_by,
    });
    const result = await listTripPlaces(place.trip_id);

    expect(created).toEqual(place);
    expect(result).toEqual([place]);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ title: '淺草寺', status: 'saved' }));
    expect(listQuery.eq).toHaveBeenCalledWith('trip_id', 'trip-1');
  });

  it('將靈感景點轉譯為行程項目並切換為 scheduled', () => {
    expect(buildItineraryItemFromPlace(place, {
      dayNumber: 2,
      startTime: '10:30',
      durationMinutes: 90,
      createdBy: 'user-1',
    })).toEqual({
      trip_id: 'trip-1',
      day_number: 2,
      position: 0,
      time: '10:30',
      location_name: '淺草寺',
      address: '日本東京都台東區淺草 2-3-1',
      latitude: 35.7148,
      longitude: 139.7967,
      notes: '早上參拜',
      category: 'spot',
      duration_minutes: 90,
      created_by: 'user-1',
    });
    expect(buildScheduledPlacePatch()).toEqual({ status: 'scheduled' });
  });
});
