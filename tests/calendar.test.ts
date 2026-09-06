import { describe, expect, it } from 'vitest';
import { buildTripIcs, escapeIcsText, exportTripCalendar } from '../lib/calendar';

const trip = {
  id: 'trip-1', title: '日本之旅', destination: '東京', start_date: '2026-10-01', end_date: '2026-10-03',
  timezone: 'Asia/Tokyo', default_departure_time: '09:00',
};

describe('calendar export', () => {
  it('escapes RFC 5545 text characters', () => {
    expect(escapeIcsText('A\\B,C;D\nE')).toBe('A\\\\B\\,C\\;D\\nE');
  });

  it('creates timezone-aware events with duration and reminders', () => {
    const ics = buildTripIcs(trip, [{ id: 'item-1', day_number: 1, position: 0, time: '14:00', duration_minutes: 90, location_name: '饗食天堂', address: '台北, 信義', notes: '記得訂位' }], { now: new Date('2026-09-06T00:00:00Z') });

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:20261001T140000');
    expect(ics).toContain('DTEND;TZID=Asia/Tokyo:20261001T153000');
    expect(ics).toContain('LOCATION:台北\\, 信義');
    expect(ics).toContain('DESCRIPTION:記得訂位');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('DTSTAMP:20260906T000000Z');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('uses the daily departure fallback and rolls duration past midnight', () => {
    const ics = buildTripIcs({ ...trip, default_departure_time: null }, [{ id: 'overnight', day_number: 2, position: 0, time: null, duration_minutes: 120, location_name: '夜景' }], { defaultDepartureTime: '23:30' });

    expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:20261002T233000');
    expect(ics).toContain('DTEND;TZID=Asia/Tokyo:20261003T013000');
  });

  it('returns serialized content without touching browser globals in native/SSR mode', async () => {
    const ics = await exportTripCalendar(trip, []);
    expect(ics).toContain('X-WR-CALNAME:日本之旅');
  });
});
