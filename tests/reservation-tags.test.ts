import { describe, expect, it } from 'vitest';
import { normalizeReservationTags, reservationTagLabels } from '../lib/reservation-tags';

describe('reservation tags', () => {
  it('keeps only supported unique keys', () => {
    expect(normalizeReservationTags(['reserved', 'reserved', 'unknown', 'ticketed'])).toEqual(['reserved', 'ticketed']);
  });

  it('maps persisted keys to user-facing labels', () => {
    expect(reservationTagLabels(['must_visit', 'ticketed'])).toEqual(['⭐ 必去', '🎟️ 已購票']);
  });
});
