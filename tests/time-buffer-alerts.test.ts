import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDaySchedule, detectTimeConflictsDetailed, type ScheduleItem } from '../lib/schedule';
import { haversineDistanceKm } from '../lib/itinerary';
import { calculateTimeConflictMinutes, shiftSubsequentItems } from '../lib/time-buffer';

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

const item = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
  id: overrides.id ?? 'item',
  day_number: overrides.day_number ?? 1,
  position: overrides.position ?? 0,
  time: overrides.time ?? null,
  duration_minutes: overrides.duration_minutes ?? 60,
  latitude: overrides.latitude ?? null,
  longitude: overrides.longitude ?? null,
  opening_hours: overrides.opening_hours ?? null,
});

describe('smart time buffers and alerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not report a conflict when expected arrival is before the next start', () => {
    // 14:03 start + 60m stay + 204m transit = 18:27; next starts at 19:30.
    expect(calculateTimeConflictMinutes(14 * 60 + 3, 60, 204, 19 * 60 + 30)).toBe(0);
  });

  it('reports the exact overlap when the next start precedes expected arrival', () => {
    // 14:03 start + 60m stay + 204m transit = 18:27; next starts at 18:00.
    expect(calculateTimeConflictMinutes(14 * 60 + 3, 60, 204, 18 * 60)).toBe(27);
  });

  it('keeps the detailed schedule conflict-free when arrival is 18:27 and the next stop starts at 19:30', () => {
    const from = { latitude: 25.0109, longitude: 121.464 };
    const to = { latitude: 25.06, longitude: 121.464 };
    const speed = haversineDistanceKm(from, to) * 60 / 204;
    const conflicts = detectTimeConflictsDetailed([
      item({ id: 'first', time: '14:03', duration_minutes: 60, ...from }),
      item({ id: 'second', position: 1, time: '19:30', duration_minutes: 45, ...to }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, averageSpeedKmh: speed });

    expect(conflicts).toEqual([]);
  });

  it('reports 27 minutes when arrival is 18:27 and the next stop starts at 18:00', () => {
    const from = { latitude: 25.0109, longitude: 121.464 };
    const to = { latitude: 25.06, longitude: 121.464 };
    const speed = haversineDistanceKm(from, to) * 60 / 204;
    const conflicts = detectTimeConflictsDetailed([
      item({ id: 'first', time: '14:03', duration_minutes: 60, ...from }),
      item({ id: 'second', position: 1, time: '18:00', duration_minutes: 45, ...to }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, averageSpeedKmh: speed });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.conflictMinutes).toBe(27);
    expect(conflicts[0]?.expectedArrivalMinutes).toBe(18 * 60 + 27);
  });

  it('emits the complete time-conflict calculation context for browser debugging', () => {
    const from = { latitude: 25.0109, longitude: 121.464 };
    const to = { latitude: 25.06, longitude: 121.464 };
    const speed = haversineDistanceKm(from, to) * 60 / 204;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    detectTimeConflictsDetailed([
      item({ id: 'first', time: '14:03', duration_minutes: 60, ...from }),
      item({ id: 'second', position: 1, time: '19:28', duration_minutes: 45, ...to }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, averageSpeedKmh: speed });

    const debugCall = log.mock.calls.find(([label, context]) => label === '[TimeConflict Debug]' && (context as { currentItem?: { id?: string } } | undefined)?.currentItem?.id === 'second');
    expect(debugCall?.[1]).toMatchObject({
      transitMinutes: 204,
      expectedArrival: 18 * 60 + 27,
      conflictMinutes: 0,
      currentItem: expect.objectContaining({ id: 'second', time: '19:28' }),
    });
    log.mockRestore();
  });

  it('reconciles parent time updates before rendering conflict badges', () => {
    const web = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.web.tsx'), 'utf8');
    const native = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.native.tsx'), 'utf8');
    expect(web).toContain('incomingRevision !== parentRevision.current ? incomingItems : localItems');
    expect(native).toContain('incomingRevision !== parentRevision.current ? incomingItems : localItems');
  });

  it('reports the overlap minutes after adding the previous stop travel time', () => {
    const conflicts = detectTimeConflictsDetailed([
      item({ id: 'first', time: '09:00', duration_minutes: 60, latitude: 25.0109, longitude: 121.464 }),
      item({ id: 'second', position: 1, time: '10:05', duration_minutes: 45, latitude: 25.06, longitude: 121.464 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: '09:00', averageSpeedKmh: 35 });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ id: 'second', previousId: 'first' });
    expect(conflicts[0]?.conflictMinutes).toBeGreaterThan(0);
  });

  it('does not report a conflict when the next stop starts at the estimated arrival', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 60, latitude: 25.0109, longitude: 121.464 }),
      item({ id: 'second', position: 1, time: '10:10', duration_minutes: 45, latitude: 25.06, longitude: 121.464 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: '09:00', averageSpeedKmh: 35 });

    expect(schedule[1]?.overlapWarning).toBe(false);
    expect(schedule[1]?.conflictMinutes).toBe(0);
  });

  it('shifts every subsequent item without mutating the source array', () => {
    const items = [
      item({ id: 'first', time: '09:00' }),
      item({ id: 'second', position: 1, time: '10:00' }),
      item({ id: 'third', position: 2, time: '23:50' }),
    ];

    const shifted = shiftSubsequentItems(items, 0, 30);

    expect(shifted.map((entry) => entry.time)).toEqual(['09:00', '10:30', '00:20']);
    expect(items.map((entry) => entry.time)).toEqual(['09:00', '10:00', '23:50']);
  });

  it('persists a schedule shift through one batch RPC payload', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const { updateItineraryItemsSchedule } = await import('../lib/itinerary-api');
    const changes = [{ id: 'second', time: '10:30' }, { id: 'third', time: '11:30' }];

    await updateItineraryItemsSchedule(changes, { offlineScope: { userId: 'user-1', tripId: 'trip-1' } });

    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('update_itinerary_items_schedule', { p_items: changes });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('exposes a minute-specific warning and optimistic shift action in the timeline', () => {
    const shared = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');
    const web = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.web.tsx'), 'utf8');
    expect(shared).toContain('scheduled.conflictMinutes');
    expect(shared).toContain('一鍵順延後續行程');
    expect(web).toContain('setLocalItems(shifted);');
    expect(web).toContain('onShiftSubsequent?.(changes)');
  });
});
