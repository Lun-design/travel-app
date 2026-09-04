import { describe, expect, it } from 'vitest';
import { isValidTripDateRange, tripDayNumberForDate, tripDayNumbers, tripDateForDay } from '../lib/trip-dates';

describe('isValidTripDateRange', () => {
  it('validates editable trip date ranges', () => {
    expect(isValidTripDateRange('2026-01-20', '2026-01-23')).toBe(true);
    expect(isValidTripDateRange('2026-01-23', '2026-01-20')).toBe(false);
    expect(isValidTripDateRange('2026-02-30', '2026-03-01')).toBe(false);
  });
});

describe('tripDayNumbers', () => {
  it('includes both start and end date without local timezone shifts', () => {
    expect(tripDayNumbers('2026-01-20', '2026-01-23')).toEqual([1, 2, 3, 4]);
  });

  it('returns one day for a same-day trip', () => {
    expect(tripDayNumbers('2026-01-20', '2026-01-20')).toEqual([1]);
  });

  it('falls back to Day 1 for invalid or reversed dates', () => {
    expect(tripDayNumbers('not-a-date', '2026-01-23')).toEqual([1]);
    expect(tripDayNumbers('2026-01-23', '2026-01-20')).toEqual([1]);
  });
});

describe('tripDayNumberForDate', () => {
  it('maps an itinerary date to its one-based day number', () => {
    expect(tripDayNumberForDate('2026-01-20', '2026-01-20')).toBe(1);
    expect(tripDayNumberForDate('2026-01-23', '2026-01-20')).toBe(4);
  });

  it('returns null for invalid or pre-trip dates', () => {
    expect(tripDayNumberForDate('2026-01-19', '2026-01-20')).toBeNull();
    expect(tripDayNumberForDate('not-a-date', '2026-01-20')).toBeNull();
  });
});

describe('tripDateForDay', () => {
  it('maps the selected Day to an ISO calendar date', () => {
    expect(tripDateForDay('2026-01-20', 3)).toBe('2026-01-22');
  });

  it('returns null for invalid dates or a non-positive day', () => {
    expect(tripDateForDay('not-a-date', 1)).toBeNull();
    expect(tripDateForDay('2026-01-20', 0)).toBeNull();
  });
});
