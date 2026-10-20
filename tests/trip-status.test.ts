import { describe, expect, it } from 'vitest';
import * as dates from '../lib/trip-dates';

describe('home trip calendar status', () => {
  const label = (start: string, end: string, today: string) => dates.tripStatusLabel(start, end, today);
  it.each([
    ['2026-10-23', '2026-10-28', '2026-10-20', '離出發還有 3 天'],
    ['2026-10-23', '2026-10-28', '2026-10-23', '今天出發'],
    ['2026-10-23', '2026-10-28', '2026-10-28', '旅程進行中'],
    ['2026-10-23', '2026-10-28', '2026-10-29', '已結束'],
    ['2024-02-29', '2024-02-29', '2024-02-28', '離出發還有 1 天'],
    ['2024-02-29', '2024-02-29', '2024-03-01', '已結束'],
    ['2026-03-09', '2026-03-10', '2026-03-08', '離出發還有 1 天'],
    ['invalid', '2026-10-28', '2026-10-20', '日期待確認'],
    ['2026-02-30', '2026-03-01', '2026-02-28', '日期待確認'],
    ['2026-10-28', '2026-10-23', '2026-10-20', '日期待確認'],
  ])('%s to %s on %s: %s', (start, end, today, expected) => expect(label(start, end, today)).toBe(expected));
});
