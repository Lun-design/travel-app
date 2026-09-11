import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../lib/itinerary-api', () => ({
  saveItineraryItem: vi.fn(),
}));

import { supabase } from '../lib/supabase';
import { saveItineraryItem } from '../lib/itinerary-api';
import {
  buildItineraryItemFromPlace,
  buildScheduledPlacePatch,
  createTripPlace,
  deleteTripPlace,
  listTripPlaces,
  scheduleTripPlace,
  updateTripPlace,
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

  it('更新收藏景點後回傳最新資料，並將空字串正規化為 null', async () => {
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ...place, title: '淺草寺（夜間）', address: null }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(updateQuery as never);

    const result = await updateTripPlace(place.id, { title: '淺草寺（夜間）', address: '  ', notes: '夜景' });

    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ title: '淺草寺（夜間）', address: null, notes: '夜景' }));
    expect(updateQuery.eq).toHaveBeenCalledWith('id', place.id);
    expect(result.title).toBe('淺草寺（夜間）');
    expect(result.address).toBeNull();
  });

  it('刪除景點會呼叫 Supabase delete', async () => {
    const deleteQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(deleteQuery as never);

    await deleteTripPlace(place.id);

    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(deleteQuery.eq).toHaveBeenCalledWith('id', place.id);
  });

  it('排入行程會先建立 itinerary item，再將來源標記為 scheduled', async () => {
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: place, error: null }),
    };
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { ...place, status: 'scheduled' }, error: null }),
    };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(readQuery as never)
      .mockReturnValueOnce(updateQuery as never);
    vi.mocked(saveItineraryItem).mockResolvedValue({ ...buildItineraryItemFromPlace(place, { dayNumber: 2, startTime: '10:30', durationMinutes: 90, createdBy: 'user-1' }), id: 'item-1', position: 0 } as never);

    const result = await scheduleTripPlace(place.id, { dayNumber: 2, startTime: '10:30', durationMinutes: 90, createdBy: 'user-1' });

    expect(saveItineraryItem).toHaveBeenCalledWith(expect.objectContaining({ location_name: '淺草寺', day_number: 2, time: '10:30' }));
    expect(updateQuery.update).toHaveBeenCalledWith({ status: 'scheduled' });
    expect(result.place.status).toBe('scheduled');
    expect(result.item.id).toBe('item-1');
  });
});
