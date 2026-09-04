import { describe, expect, it } from 'vitest';
import { tripDayNumbers } from '../lib/trip-dates';

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
