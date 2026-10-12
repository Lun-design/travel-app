import { describe, expect, it } from 'vitest';
import { searchTripData, getTripSearchDestination, type TripSearchData } from '../lib/trip-search';
const data = {
  tripId: 'trip',
  items: [{ id: 'spot', trip_id: 'trip', location_name: 'USJ 環球影城', address: '大阪', notes: '集合點在正門', day_number: 2 }, { id: 'other', trip_id: 'other-trip', location_name: 'USJ' }],
  vouchers: [{ id: 'ticket', trip_id: 'trip', title: 'USJ 門票', reservation_number: 'ABC123', notes: 'QR Code', item_id: 'spot' }],
  expenses: [{ id: 'cost', trip_id: 'trip', title: 'USJ 門票費', amount: 2000, currency: 'JPY' }],
  places: [{ id: 'idea', trip_id: 'trip', title: 'USJ 附近咖啡', address: '大阪', notes: '備用集合點' }],
} as unknown as TripSearchData;
describe('trip-wide local search', () => {
  it('selects the correct day or module and passes the original ticket to the preview', () => {
    const matches = searchTripData(data, 'USJ');
    expect(getTripSearchDestination(data, matches[0])).toEqual({ tab: 'timeline', id: 'spot', day: 2 });
    expect(getTripSearchDestination(data, matches[1])).toMatchObject({ tab: 'documents', voucher: { id: 'ticket', reservation_number: 'ABC123' } });
    expect(getTripSearchDestination(data, matches[2])).toEqual({ tab: 'expenses', id: 'cost' });
    expect(getTripSearchDestination(data, matches[3])).toEqual({ tab: 'places', id: 'idea' });
  });
  it('does not navigate to a deleted result or another trip', () => {
    expect(getTripSearchDestination(data, { kind: 'item', id: 'other', title: '', subtitle: '' })).toBeNull();
    expect(getTripSearchDestination(data, { kind: 'voucher', id: 'missing', title: '', subtitle: '' })).toBeNull();
  });
  it('opens a backup item for inspection rather than scrolling to a hidden timeline card', () => {
    const withBackup = { ...data, items: [{ ...data.items[0], is_backup: true }] };
    expect(getTripSearchDestination(withBackup, searchTripData(withBackup, 'USJ', 'item')[0])).toMatchObject({ tab: 'timeline', day: 2, previewBackup: true });
  });
  it('finds all four kinds of trip data and excludes other trips', () => {
    expect(searchTripData(data, 'usj').map((row) => `${row.kind}:${row.id}`)).toEqual(['item:spot', 'voucher:ticket', 'expense:cost', 'place:idea']);
  });
  it('searches reservation numbers, addresses and notes without any network calls', () => {
    expect(searchTripData(data, ' abc123 ')[0]).toMatchObject({ kind: 'voucher', id: 'ticket', dayNumber: 2 });
    expect(searchTripData(data, '集合點', 'item')[0].id).toBe('spot');
    // Linked tickets are searchable through their destination's address too.
    expect(searchTripData(data, '大阪').map((row) => row.id)).toEqual(['spot', 'ticket', 'idea']);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('normalizes full-width text and supports multiple search terms', () => {
    expect(searchTripData(data, 'ＵＳＪ 大阪').map((row) => row.id)).toEqual(['spot', 'ticket', 'idea']);
  });
  it('handles blanks, punctuation and malformed optional data safely', () => {
    expect(searchTripData(data, '   ')).toEqual([]);
    expect(searchTripData(data, '<script>')).toEqual([]);
    expect(searchTripData({ ...data, items: [{ id: 'x', trip_id: 'trip', location_name: null }] as unknown as TripSearchData['items'] }, 'USJ')).toHaveLength(3);
  });
});
