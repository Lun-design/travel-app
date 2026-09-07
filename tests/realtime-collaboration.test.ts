import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  applyRealtimeChange,
  subscribeToTripRealtime,
  type RealtimeChange,
  type RealtimeChannelLike,
  type RealtimeClientLike,
} from '../lib/realtime-collaboration';

type Row = { id: string; title: string; updated_at?: string | null };

function change(eventType: RealtimeChange['eventType'], record: Partial<Row>, oldRecord: Partial<Row> = {}): RealtimeChange {
  return { table: 'itinerary_items', eventType, record, oldRecord };
}

describe('realtime collaboration', () => {
  it('keeps the newer local row when an older remote event arrives', () => {
    const current: Row[] = [{ id: 'item-1', title: '本機版本', updated_at: '2026-09-08T10:05:00.000Z' }];
    const result = applyRealtimeChange(current, change('UPDATE', {
      id: 'item-1', title: '舊的隊友版本', updated_at: '2026-09-08T10:04:00.000Z',
    }));
    expect(result).toEqual(current);
  });

  it('applies newer insert/update events and removes newer deletes', () => {
    const first = applyRealtimeChange<Row>([], change('INSERT', { id: 'item-1', title: '清水寺', updated_at: '2026-09-08T10:00:00.000Z' }));
    const updated = applyRealtimeChange(first, change('UPDATE', { id: 'item-1', title: '清水寺（已調整）', updated_at: '2026-09-08T10:01:00.000Z' }));
    expect(updated).toEqual([{ id: 'item-1', title: '清水寺（已調整）', updated_at: '2026-09-08T10:01:00.000Z' }]);
    expect(applyRealtimeChange(updated, change('DELETE', {}, { id: 'item-1', updated_at: '2026-09-08T10:02:00.000Z' }))).toEqual([]);
  });

  it('subscribes every collaborative table with a trip filter and cleans up the channel', () => {
    const handlers: Array<(payload: any) => void> = [];
    const channel: RealtimeChannelLike = {
      on: vi.fn((_type, filter, callback) => { handlers.push(callback); expect(filter).toMatchObject({ event: '*', schema: 'public' }); return channel; }),
      subscribe: vi.fn(),
    };
    const client: RealtimeClientLike = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => 'ok'),
    };
    const onChange = vi.fn();
    const unsubscribe = subscribeToTripRealtime(client, 'trip-1', onChange);

    expect(client.channel).toHaveBeenCalledWith('trip-realtime:trip-1');
    expect(channel.on).toHaveBeenCalledTimes(4);
    expect(vi.mocked(channel.on).mock.calls.map((call) => call[1])).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'itinerary_items', filter: 'trip_id=eq.trip-1' }),
      expect.objectContaining({ table: 'trip_places', filter: 'trip_id=eq.trip-1' }),
      expect.objectContaining({ table: 'expenses', filter: 'trip_id=eq.trip-1' }),
      expect.objectContaining({ table: 'packing_items', filter: 'trip_id=eq.trip-1' }),
    ]));
    expect(channel.subscribe).toHaveBeenCalledTimes(1);
    handlers[0]({ eventType: 'INSERT', new: { id: 'item-1' }, old: {} });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ table: 'itinerary_items', eventType: 'INSERT' }));

    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('does not open a channel before a trip id is available', () => {
    const client: RealtimeClientLike = { channel: vi.fn(), removeChannel: vi.fn() };
    const unsubscribe = subscribeToTripRealtime(client, '  ', vi.fn());
    unsubscribe();
    expect(client.channel).not.toHaveBeenCalled();
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it('keeps the hook wired for realtime notices and packing refreshes', () => {
    const source = readFileSync('src/hooks/useTripDetailData.ts', 'utf8');
    const screen = readFileSync('src/app/trips/[id].tsx', 'utf8');
    const packing = readFileSync('src/components/PackingPanel.tsx', 'utf8');
    expect(source).toContain('subscribeToTripRealtime');
    expect(source).toContain('realtimeNotice');
    expect(source).toContain('packingRevision');
    expect(screen).toContain('realtimeNotice');
    expect(screen).toContain('refreshToken={data.packingRevision}');
    expect(packing).toContain('refreshToken');
  });

  it('adds timestamp metadata and triggers to every collaborative table', () => {
    const migration = readFileSync('supabase/migrations/20260909000000_realtime_collaboration.sql', 'utf8');
    for (const table of ['itinerary_items', 'trip_places', 'expenses', 'packing_items']) {
      expect(migration).toContain(`alter table public.${table} add column if not exists updated_at`);
      expect(migration).toContain(`alter table public.${table} add column if not exists updated_by`);
      expect(migration).toContain(`create trigger ${table}_updated_metadata`);
    }
    expect(migration).toContain('create or replace function private.set_updated_metadata');
  });
});
