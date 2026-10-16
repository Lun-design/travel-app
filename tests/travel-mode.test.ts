import { describe, expect, it } from 'vitest';
import { travelStops, moveTravelCursor, stationVouchers } from '../lib/travel-mode';
import { getTimeContextLabel } from '../lib/time-context';
import type { ItineraryItem } from '../lib/itinerary';
import type { Voucher } from '../lib/vouchers';
describe('manual travel mode', () => {
  it('uses existing position order and never mutates source times, positions or completion', () => {
    const items = [{ id: 'b', trip_id: 't', day_number: 1, position: 2, time: '06:00' }, { id: 'a', trip_id: 't', day_number: 1, position: 1, time: '09:00' }, { id: 'other', trip_id: 'other', day_number: 1, position: 0 }, { id: 'backup', trip_id: 't', day_number: 1, is_backup: true }, { id: 'day2', trip_id: 't', day_number: 2 }] as ItineraryItem[];
    const before = JSON.stringify(items); const stops = travelStops(items, 't', 1);
    expect(stops.map((v) => v.id)).toEqual(['a', 'b']);
    expect(moveTravelCursor(stops, 'a', 1)).toBe('b'); expect(moveTravelCursor(stops, 'b', 1)).toBe('b');
    expect(moveTravelCursor(stops, 'a', -1)).toBe('a'); expect(moveTravelCursor([], null, 1)).toBeNull();
    expect(JSON.stringify(items)).toBe(before);
  });
  it('shows only vouchers explicitly bound to this station and trip', () => {
    const vouchers = [{ id: 'v', trip_id: 't', item_id: 'a' }, { id: 'other', trip_id: 't', item_id: 'b' }, { id: 'foreign', trip_id: 'other', item_id: 'a' }] as Voucher[];
    expect(stationVouchers(vouchers, 't', 'a').map((v) => v.id)).toEqual(['v']);
  });
});
describe('label-only time context', () => {
  it('honors explicit time annotations instead of guessing from the destination', () => {
    expect(getTimeContextLabel({ location_name: '桃園起飛（台灣時間）' }, 'Asia/Tokyo')).toBe('台灣時間');
    expect(getTimeContextLabel({ location_name: '關西抵達（日本時間）' }, 'Asia/Taipei')).toBe('日本時間');
    expect(getTimeContextLabel({ location_name: '首爾集合（韓國時間）' }, 'Asia/Tokyo')).toBe('韓國時間');
  });
  it('labels a trip context explicitly and never infers timezone from place names', () => {
    expect(getTimeContextLabel({ location_name: '桃園機場出發' }, 'Asia/Tokyo')).toContain('依行程時區');
    expect(getTimeContextLabel({ location_name: '桃園機場出發' }, 'Asia/Tokyo')).toContain('日本');
    expect(getTimeContextLabel({}, undefined)).toBe('時區未註明');
    expect(getTimeContextLabel({}, 'bad-zone')).toBe('時區未註明');
  });
});
