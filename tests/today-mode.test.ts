import { describe, expect, it } from 'vitest';
import { findActiveOrNextSpot, distanceToFocusSpot, shouldUseCompactTodayBanner } from '../lib/today-mode';
import { haversineDistanceKm } from '../lib/itinerary';
import { getGoogleMapsDirectionsUrl } from '../lib/map-links';

const schedule: any[] = [
  {
    item: { id: 'spot-a', day_number: 1, position: 0, time: '09:00', duration_minutes: 60, latitude: 25.033, longitude: 121.565, opening_hours: null },
    scheduledStart: '09:00', arrivalTime: '09:00', departureTime: '10:00', arrivalMinutes: 540, departureMinutes: 600,
    durationMinutes: 60, travelMinutes: 0, estimated: false, openingWarning: false, overlapWarning: false,
  },
  {
    item: { id: 'spot-b', day_number: 1, position: 1, time: '10:30', duration_minutes: 45, latitude: 25.047, longitude: 121.517, opening_hours: null },
    scheduledStart: '10:30', arrivalTime: '10:30', departureTime: '11:15', arrivalMinutes: 630, departureMinutes: 675,
    durationMinutes: 45, travelMinutes: 12, estimated: false, openingWarning: false, overlapWarning: false,
  },
];

describe('Today Mode focus selection', () => {
  it('finds the currently active spot and remaining minutes', () => {
    const result = findActiveOrNextSpot(schedule, { scheduleDate: '2026-01-20', now: new Date('2026-01-20T09:30:00+08:00'), timezone: 'Asia/Taipei' });

    expect(result.mode).toBe('active');
    expect(result.scheduled?.item.id).toBe('spot-a');
    expect(result.minutesRemaining).toBe(30);
  });

  it('finds the next spot when the current one has ended', () => {
    const result = findActiveOrNextSpot(schedule, { scheduleDate: '2026-01-20', now: new Date('2026-01-20T10:05:00+08:00'), timezone: 'Asia/Taipei' });

    expect(result.mode).toBe('next');
    expect(result.scheduled?.item.id).toBe('spot-b');
    expect(result.minutesUntil).toBe(25);
  });

  it('returns a trip countdown for a future itinerary date', () => {
    const result = findActiveOrNextSpot(schedule, { scheduleDate: '2026-01-20', now: new Date('2026-01-18T12:00:00+08:00'), timezone: 'Asia/Taipei' });

    expect(result.mode).toBe('countdown');
    expect(result.daysUntil).toBe(2);
    expect(result.scheduled?.item.id).toBe('spot-a');
  });
});

describe('Today Mode distance and navigation', () => {
  it('calculates the Haversine distance from the previous spot', () => {
    expect(distanceToFocusSpot(schedule[1], schedule)).toBeCloseTo(haversineDistanceKm({ latitude: 25.033, longitude: 121.565 }, { latitude: 25.047, longitude: 121.517 }), 6);
  });

  it('builds a Google Maps navigation URL for the focus spot', () => {
    expect(getGoogleMapsDirectionsUrl(25.047, 121.517)).toContain('destination=25.047%2C121.517');
  });
});

describe('Today Mode mobile presentation', () => {
  it('uses a compact expandable banner for future or completed dates with spots', () => {
    expect(shouldUseCompactTodayBanner('countdown', true)).toBe(true);
    expect(shouldUseCompactTodayBanner('past', true)).toBe(true);
  });

  it('keeps empty and active dates in the full focus-card flow', () => {
    expect(shouldUseCompactTodayBanner('active', true)).toBe(false);
    expect(shouldUseCompactTodayBanner('empty', false)).toBe(false);
  });
});
