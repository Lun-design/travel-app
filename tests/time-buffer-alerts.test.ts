import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDaySchedule, detectTimeConflictsDetailed, type ScheduleItem } from '../lib/schedule';
import { haversineDistanceKm } from '../lib/itinerary';
import { calculateTimeConflictMinutes, shiftSubsequentItems } from '../lib/time-buffer';
import { checkOperatingHoursConflict } from '../lib/operating-hours';

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
    const stationCall = log.mock.calls.find(([label]) => label === '[Conflict Debug] Station 1:');
    expect(stationCall?.[1]).toMatchObject({
      prevStartTime: '14:03',
      prevDuration: 60,
      transitMinutes: 204,
      expectedArrivalMinutes: 18 * 60 + 27,
      currentStartTime: '19:28',
      conflictMinutes: 0,
    });
    log.mockRestore();
  });

  it('reconciles parent time updates before rendering conflict badges', () => {
    const web = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.web.tsx'), 'utf8');
    const native = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.native.tsx'), 'utf8');
    expect(web).toContain('incomingRevision !== parentRevision.current ? incomingItems : localItems');
    expect(native).toContain('incomingRevision !== parentRevision.current ? incomingItems : localItems');
    expect(web).toContain('useWeatherByItem(displayItems, scheduleContext, tripId, routeTransitMinutes)');
    expect(native).toContain('useWeatherByItem(displayItems, scheduleContext, tripId, routeTransitMinutes)');
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

  it('uses the latest route estimate and a safe duration fallback for conflict checks', () => {
    const previous = item({ id: 'first', time: '15:03', duration_minutes: 60 });
    previous.duration_minutes = null;
    const current = item({ id: 'second', position: 1, time: '19:30', duration_minutes: 45 });
    const schedule = buildDaySchedule([previous, current], {
      tripStartDate: '2026-01-20',
      dayNumber: 1,
      transitMinutesByFromId: { first: 204 },
    });

    expect(schedule[1]).toMatchObject({ travelMinutes: 204, conflictMinutes: 0, overlapWarning: false });
    expect(schedule[0]?.durationMinutes).toBe(60);
  });

  it('shifts the conflicting stop to the estimated arrival and clears its warning', () => {
    const previous = item({ id: 'meal', time: '12:56', duration_minutes: 60 });
    const current = item({ id: 'xin-zhuang', position: 1, time: '14:03', duration_minutes: 60 });
    const context = {
      tripStartDate: '2026-01-20',
      dayNumber: 1,
      transitMinutesByFromId: { meal: 16 },
    };

    const before = buildDaySchedule([previous, current], context);
    expect(before[1]).toMatchObject({ arrivalTime: '14:03', conflictMinutes: 9, overlapWarning: true });

    const shifted = shiftSubsequentItems([previous, current], 0, before[1]?.conflictMinutes ?? 0);
    const after = buildDaySchedule(shifted, context);
    expect(shifted[1]?.time).toBe('14:12');
    expect(after[1]).toMatchObject({ arrivalTime: '14:12', conflictMinutes: 0, overlapWarning: false });
  });

  it('does not render stay-duration conflict warnings in the flexible timeline', () => {
    const shared = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');

    expect(shared).not.toContain("console.warn('[UI RENDER CONFLICT]'");
    expect(shared).not.toContain('⚠️ 時間重疊');
    expect(shared).not.toContain('一鍵順延後續行程');
  });

  it('does not report a conflict when the next stop starts at the estimated arrival', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 60, latitude: 25.0109, longitude: 121.464 }),
      item({ id: 'second', position: 1, time: '10:10', duration_minutes: 45, latitude: 25.06, longitude: 121.464 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: '09:00', averageSpeedKmh: 35 });

    expect(schedule[1]?.overlapWarning).toBe(false);
    expect(schedule[1]?.conflictMinutes).toBe(0);
  });

  it('adds the configured default buffer to arrival and conflict calculations without changing raw travel minutes', () => {
    const context = {
      tripStartDate: '2026-01-20',
      dayNumber: 1,
      transitMinutesByFromId: { first: 30 },
      includeBuffer: true,
      defaultBufferMinutes: 10,
    };
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 60 }),
      item({ id: 'second', position: 1, time: '10:35', duration_minutes: 45 }),
    ], context);

    expect(schedule[1]).toMatchObject({
      travelMinutes: 30,
      bufferMinutes: 10,
      effectiveTravelMinutes: 40,
      arrivalTime: '10:35',
      conflictMinutes: 5,
      overlapWarning: true,
    });
  });

  it('keeps the buffer disabled unless the schedule context opts in', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 60 }),
      item({ id: 'second', position: 1, time: '10:35', duration_minutes: 45 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, transitMinutesByFromId: { first: 30 }, defaultBufferMinutes: 10 });

    expect(schedule[1]).toMatchObject({ bufferMinutes: 0, effectiveTravelMinutes: 30, conflictMinutes: 0, overlapWarning: false });
  });

  it('treats an exact departure hand-off as a conflict when the opt-in buffer is enabled', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 60 }),
      item({ id: 'second', position: 1, time: '10:00', duration_minutes: 45 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, transitMinutesByFromId: { first: 30 }, includeBuffer: true, defaultBufferMinutes: 10 });

    expect(schedule[1]).toMatchObject({ conflictMinutes: 40, overlapWarning: true, bufferMinutes: 10 });
  });

  it('flags arrival or departure outside a location opening interval', () => {
    const openHours = { monday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] } };
    const target = item({ opening_hours: openHours });

    expect(checkOperatingHoursConflict(target, '10:00', '17:00', { date: '2026-01-19' })).toMatchObject({ conflict: false, reason: null });
    expect(checkOperatingHoursConflict(target, '17:30', '18:30', { date: '2026-01-19' })).toMatchObject({ conflict: true, reason: 'outside-hours' });
  });

  it('flags a closed weekday while allowing an item without opening hours', () => {
    const closed = item({ opening_hours: { tuesday: { closed: true, periods: [] } } });

    expect(checkOperatingHoursConflict(closed, '10:00', '11:00', { date: '2026-01-20' })).toMatchObject({ conflict: true, reason: 'closed' });
    expect(checkOperatingHoursConflict(item({ opening_hours: null }), '10:00', '11:00', { date: '2026-01-20' })).toMatchObject({ conflict: false, reason: null });
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

  it('keeps the legacy batch shift API available without rendering a stay warning', () => {
    const shared = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');
    const web = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.web.tsx'), 'utf8');
    expect(shared).not.toContain('scheduled.conflictMinutes');
    expect(shared).not.toContain('一鍵順延後續行程');
    expect(web).toContain('setLocalItems(shifted);');
    expect(web).toContain('onShiftSubsequent?.(changes)');
  });

  it('keeps the default buffer in scheduling without surfacing redundant route-pill copy', () => {
    const panel = readFileSync(path.resolve(process.cwd(), 'src/components/trip-detail/TimelinePanel.tsx'), 'utf8');
    const shared = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');

    expect(panel).toContain('includeBuffer: true');
    expect(panel).toContain('defaultBufferMinutes: 10');
    expect(shared).not.toContain('nextScheduled?.bufferMinutes');
    expect(shared).not.toContain('含緩衝');
  });
});
