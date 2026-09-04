import { describe, expect, it } from 'vitest';
import { buildDaySchedule, isOpenAt, type ScheduleItem } from '../lib/schedule';

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

describe('buildDaySchedule', () => {
  it('uses the trip departure time, then adds duration and travel time', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: null, duration_minutes: 60, latitude: 25, longitude: 121 }),
      item({ id: 'second', position: 1, time: null, duration_minutes: 30, latitude: 25.01, longitude: 121 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: '08:30' });

    expect(schedule.map((entry) => entry.arrivalTime)).toEqual(['08:30', '09:32']);
    expect(schedule[0].departureTime).toBe('09:30');
    expect(schedule[1].overlapWarning).toBe(false);
  });

  it('falls back to 09:00 and treats null duration as 60 minutes', () => {
    const [entry] = buildDaySchedule([item({ duration_minutes: null })], {
      tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: null,
    });

    expect(entry.arrivalTime).toBe('09:00');
    expect(entry.departureTime).toBe('10:00');
  });

  it('marks an explicitly scheduled item that starts before the previous item can finish', () => {
    const schedule = buildDaySchedule([
      item({ id: 'first', time: '10:00', duration_minutes: 120, latitude: 25, longitude: 121 }),
      item({ id: 'second', position: 1, time: '10:30', latitude: 25, longitude: 121 }),
    ], { tripStartDate: '2026-01-20', dayNumber: 1, defaultDepartureTime: '09:00' });

    expect(schedule[1].arrivalTime).toBe('10:30');
    expect(schedule[1].overlapWarning).toBe(true);
  });

  it('uses the selected itinerary day when checking weekly opening hours', () => {
    const [entry] = buildDaySchedule([item({ time: '11:00', opening_hours: {
      tuesday: { closed: false, periods: [{ open: '09:00', close: '10:00' }] },
    } })], { tripStartDate: '2026-01-19', dayNumber: 2, defaultDepartureTime: '09:00' });

    expect(entry.openingWarning).toBe(true);
  });

  it('uses the next calendar date when the calculated arrival crosses midnight', () => {
    const schedule = buildDaySchedule([
      item({ id: 'late', time: '23:30', duration_minutes: 120, latitude: 25, longitude: 121 }),
      item({ id: 'overnight', position: 1, opening_hours: {
        monday: { closed: true, periods: [] },
        tuesday: { closed: false, periods: [{ open: '01:00', close: '02:00' }] },
      }, latitude: 25, longitude: 121 }),
    ], { tripStartDate: '2026-01-19', dayNumber: 1, defaultDepartureTime: '09:00' });

    expect(schedule[1].arrivalTime).toBe('01:31');
    expect(schedule[1].openingWarning).toBe(false);
  });
});

describe('isOpenAt', () => {
  it('matches a weekday period and identifies a closed day', () => {
    const openingHours = {
      tuesday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
      wednesday: { closed: true, periods: [] },
    };

    expect(isOpenAt(openingHours, '2026-01-20', '10:00')).toBe(true);
    expect(isOpenAt(openingHours, '2026-01-21', '10:00')).toBe(false);
    expect(isOpenAt(openingHours, '2026-01-20', '18:00')).toBe(false);
  });

  it('supports multiple periods and an overnight period from the previous weekday', () => {
    const openingHours = {
      sunday: { closed: false, periods: [{ open: '18:00', close: '02:00' }] },
      monday: { closed: false, periods: [{ open: '09:00', close: '12:00' }, { open: '13:00', close: '17:00' }] },
    };

    expect(isOpenAt(openingHours, '2026-01-19', '01:00')).toBe(true);
    expect(isOpenAt(openingHours, '2026-01-19', '12:30')).toBe(false);
    expect(isOpenAt(openingHours, '2026-01-19', '13:00')).toBe(true);
  });
});
