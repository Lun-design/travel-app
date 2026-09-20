import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDaySchedule, detectTimeConflictsDetailed, type ScheduleItem } from '../lib/schedule';

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

const context = {
  tripStartDate: '2026-01-20',
  dayNumber: 1,
  defaultDepartureTime: '09:00',
  transitMinutesByFromId: { first: 20 },
  includeBuffer: true,
  defaultBufferMinutes: 10,
  respectStopDurations: false,
};

describe('optional stop-duration mode', () => {
  it('ignores stored stay minutes when the timeline opts out', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '09:00', duration_minutes: 180 }),
      item({ id: 'second', position: 1, time: null, duration_minutes: 120 }),
    ], context);

    expect(schedule[0]).toMatchObject({ durationMinutes: 0, departureTime: '09:00' });
    expect(schedule[1]).toMatchObject({ arrivalTime: '09:30', durationMinutes: 0, departureTime: '09:30', conflictMinutes: 0, overlapWarning: false });
  });

  it('does not create overlap warnings from stored stay minutes', () => {
    const conflicts = detectTimeConflictsDetailed([
      item({ id: 'first', time: '09:00', duration_minutes: 180 }),
      item({ id: 'second', position: 1, time: '09:05', duration_minutes: 120 }),
    ], context);

    expect(conflicts).toEqual([]);
  });

  it('removes stay-duration controls and text from the user-facing timeline', () => {
    const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(source('src/components/trip-detail/TimelinePanel.tsx')).toContain('respectStopDurations: false');
    expect(source('src/components/ItineraryTimeline.shared.tsx')).not.toContain('停留 ${duration} 分鐘');
    expect(source('src/components/ItineraryItemModal.tsx')).not.toContain('預估停留時間（分鐘）');
    expect(source('src/components/TripPlacesPanel.tsx')).not.toContain('停留時間（分鐘）');
    expect(source('src/components/ItineraryCardExport.tsx')).not.toContain('停留 {item.durationMinutes} 分鐘');
    expect(source('src/components/DashboardMetricsBar.tsx')).not.toContain('停留 ${formatMetricDuration');
  });
});
