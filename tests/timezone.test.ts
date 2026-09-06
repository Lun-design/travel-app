import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  addCalendarDays,
  getWeekdayForIsoDate,
  inferTimezoneFromDestination,
  normalizeTimezone,
  toZonedDateTimeParts,
} from '../lib/timezone';

describe('timezone helpers', () => {
  it('validates IANA zones and falls back safely', () => {
    expect(normalizeTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(normalizeTimezone('not/a-zone')).toBe(DEFAULT_TIMEZONE);
    expect(normalizeTimezone('')).toBe(DEFAULT_TIMEZONE);
    expect(getWeekdayForIsoDate('2026-02-30', 'Asia/Tokyo')).toBeNull();
  });

  it('uses the destination zone for weekday and calendar calculations', () => {
    expect(getWeekdayForIsoDate('2026-01-20', 'Asia/Tokyo')).toBe('tuesday');
    expect(getWeekdayForIsoDate('2026-01-20', 'Pacific/Kiritimati')).toBe('tuesday');
    expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(toZonedDateTimeParts(new Date('2026-01-20T23:30:00.000Z'), 'Asia/Tokyo')).toMatchObject({
      date: '2026-01-21',
      time: '08:30',
      weekday: 'wednesday',
    });
  });

  it('provides a conservative destination inference for common trip labels', () => {
    expect(inferTimezoneFromDestination('東京／日本')).toBe('Asia/Tokyo');
    expect(inferTimezoneFromDestination('Paris, France')).toBe('Europe/Paris');
    expect(inferTimezoneFromDestination('台北')).toBe(DEFAULT_TIMEZONE);
  });
});
