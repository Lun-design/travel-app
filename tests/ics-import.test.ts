import { describe, expect, it } from 'vitest';
import { parseIcsCalendar } from '../lib/ics-import';

describe('ics itinerary import', () => {
  it('parses timed, all-day and cross-midnight events', () => {
    const draft = parseIcsCalendar([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:a',
      'DTSTART;TZID=Asia/Tokyo:20261023T103000',
      'DTEND;TZID=Asia/Tokyo:20261023T120000',
      'SUMMARY:Universal Studios Japan',
      'LOCATION:Osaka Konohana Ward',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b',
      'DTSTART;VALUE=DATE:20261024',
      'SUMMARY:Free time',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(draft.days).toHaveLength(2);
    expect(draft.days[0].items[0]).toMatchObject({
      title: 'Universal Studios Japan',
      startTime: '10:30',
      durationMinutes: 90,
      address: 'Osaka Konohana Ward',
    });
    expect(draft.days[1].items[0].startTime).toBeUndefined();
  });
});
