import { describe, expect, it, vi } from 'vitest';
import * as preparation from '../lib/trip-preparation';
import * as shortcuts from '../lib/trip-shortcuts';
import type { Voucher } from '../lib/vouchers';
import type { ItineraryItem } from '../lib/itinerary';
import { getVoucherFileKey } from '../lib/voucher-files';
import { positionNewItineraryItem } from '../lib/itinerary-create';
const scope = { userId: 'user', tripId: 'trip' };
const tickets = [{ id: 'one', trip_id: 'trip', file_path: '1.png' }, { id: 'two', trip_id: 'trip', file_path: '2.pdf' }, { id: 'foreign', trip_id: 'other', file_path: '3.pdf' }] as Voucher[];
describe('preparation availability', () => {
  it('counts only actual scoped cached files and never fetches a signed URL', async () => {
    const has = vi.fn(async (key: string) => key === getVoucherFileKey(tickets[0], scope));
    const result = await preparation.checkVoucherAvailability(tickets, scope, { has, read: vi.fn(), write: vi.fn() });
    expect(result).toEqual({ total: 2, missingIds: ['two'], unknown: false });
    expect(has).toHaveBeenCalledTimes(2); expect(fetch).not.toHaveBeenCalled();
  });
  it('reports unknown rather than missing or complete on cache failure', async () => {
    const result = await preparation.checkVoucherAvailability(tickets, scope, { has: async () => { throw new Error('storage denied'); }, read: vi.fn(), write: vi.fn() });
    expect(result.unknown).toBe(true); expect(result.total).toBe(2);
  });
});
describe('important information preferences', () => {
  it('isolates stored pins by account and trip', () => {
    expect(shortcuts.shortcutStorageKey(scope)).not.toBe(shortcuts.shortcutStorageKey({ ...scope, userId: 'other' }));
    expect(shortcuts.shortcutStorageKey(scope)).not.toBe(shortcuts.shortcutStorageKey({ ...scope, tripId: 'other' }));
  });
  it('handles corrupted preferences and removes invalid or duplicate entries', () => {
    expect(shortcuts.parseShortcutPins('{')).toEqual([]);
    expect(shortcuts.parseShortcutPins('null')).toEqual([]);
    expect(shortcuts.parseShortcutPins('[{"id":"1","kind":"hotel"},{"id":"1","kind":"hotel"},{"id":"2","kind":"bad"}]')).toEqual([{ id: '1', kind: 'hotel' }]);
  });
  it('uses current itinerary details, ignores deleted/foreign items and never shares private notes', () => {
    const item = { id: '1', trip_id: 'trip', location_name: '大國町 Airbnb', address: '大阪市浪速區', day_number: 2, time: '15:00', notes: '門鎖密碼1234' } as ItineraryItem;
    const pins = [{ id: 'deleted', kind: 'meeting' }, { id: '1', kind: 'hotel' }] as shortcuts.ShortcutPin[];
    expect(shortcuts.resolveShortcutItems(pins, [item], 'trip')).toEqual([{ pin: pins[1], item }]);
    const message = shortcuts.buildShortcutText(item, 'hotel');
    expect(message).toContain('大阪市浪速區'); expect(message).toContain('15:00'); expect(message).not.toContain('1234');
    expect(shortcuts.resolveShortcutItems(pins, [item], 'another')).toEqual([]);
  });
});
describe('consecutive itinerary placement', () => {
  it('appends unnamed-time stops to the selected day without changing existing positions or edits', () => {
    const items = [{ id: 'old', trip_id: 'trip', day_number: 2, position: 7 }, { id: 'other', trip_id: 'trip', day_number: 1, position: 500 }] as ItineraryItem[];
    const input = { trip_id: 'trip', created_by: 'user', day_number: 2, location_name: '新景點', time: null };
    expect(positionNewItineraryItem(input, items).position).toBe(8);
    expect(positionNewItineraryItem({ ...input, day_number: 3 }, items).position).toBe(0);
    expect(positionNewItineraryItem({ ...input, id: 'old' }, items)).toEqual({ ...input, id: 'old' });
    expect(positionNewItineraryItem({ ...input, position: 3 }, items).position).toBe(3);
    expect(items[0].position).toBe(7);
  });
});
