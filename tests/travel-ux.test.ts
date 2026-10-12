import { describe, expect, it } from 'vitest';
import { getTodayTripDay, getDayVouchers, describeCollaborativeUpdate } from '../lib/travel-ux';
import type { ItineraryItem } from '../lib/itinerary';
import type { Voucher } from '../lib/vouchers';
const trip = { start_date: '2026-10-12', end_date: '2026-10-14', timezone: 'Asia/Tokyo' };
describe('today and ticket shortcuts', () => {
  it('uses the trip timezone rather than the device timezone near midnight', () => {
    expect(getTodayTripDay(trip, new Date('2026-10-12T15:30:00Z'))).toBe(2);
    expect(getTodayTripDay({ ...trip, timezone: 'America/Los_Angeles' }, new Date('2026-10-12T15:30:00Z'))).toBe(1);
  });
  it('does not jump to an invented day outside the trip or for invalid dates', () => {
    expect(getTodayTripDay(trip, new Date('2026-10-11T01:00:00Z'))).toBeNull();
    expect(getTodayTripDay(trip, new Date('invalid'))).toBeNull();
  });
  it('includes scheduled and bound tickets once, while excluding other days', () => {
    const items = [{ id: 'a', day_number: 2 }, { id: 'b', day_number: 1 }] as ItineraryItem[];
    const vouchers = [
      { id: 'date', usage_at: '2026-10-13T10:00:00+09:00' },
      { id: 'bound', item_id: 'a', usage_at: null },
      { id: 'both', item_id: 'a', usage_at: '2026-10-13' },
      { id: 'other', item_id: 'a', usage_at: '2026-10-14' },
      { id: 'bad', usage_at: 'invalid' },
    ] as Voucher[];
    expect(getDayVouchers(trip, 2, items, vouchers).map((voucher) => voucher.id)).toEqual(['date', 'bound', 'both']);
  });
});
describe('collaboration notices', () => {
  it('identifies the member and day affected by a teammate update', () => {
    const notice = describeCollaborativeUpdate({ table: 'itinerary_items', eventType: 'UPDATE', record: { day_number: 2, location_name: '黑門市場' }, oldRecord: {} }, '小白');
    expect(notice).toContain('小白');
    expect(notice).toContain('Day 2');
    expect(notice).toContain('黑門市場');
  });
  it('uses safe labels for deletes and missing metadata', () => {
    expect(describeCollaborativeUpdate({ table: 'expenses', eventType: 'DELETE', record: {}, oldRecord: {} }, '')).toContain('旅伴');
  });
});
