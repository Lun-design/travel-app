/** Utilities for calculating and applying schedule time buffers. */

const MINUTES_PER_DAY = 24 * 60;
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

export type TimeShiftable = {
  time?: string | null;
  start_time?: string | null;
};

export type TimeConflictCalculation = {
  expectedArrivalMinutes: number;
  conflictMinutes: number;
  isConflict: boolean;
};

/**
 * Calculate the overlap between a previous activity and the next activity.
 *
 * The previous activity's departure is intentionally derived from its start
 * and duration here, so every caller uses the same unit-safe formula. A
 * schedule is only conflicting when the next activity starts before the
 * estimated arrival; touching boundaries are valid hand-offs and return zero.
 */
export function calculateTimeConflict(
  previousStartMinutes: number,
  previousDurationMinutes: number,
  transitMinutes: number,
  currentStartMinutes: number,
): TimeConflictCalculation {
  const values = [previousStartMinutes, previousDurationMinutes, transitMinutes, currentStartMinutes];
  if (!values.every((value) => Number.isFinite(value))) {
    return { expectedArrivalMinutes: currentStartMinutes, conflictMinutes: 0, isConflict: false };
  }
  const expectedArrivalMinutes = previousStartMinutes + previousDurationMinutes + transitMinutes;
  const conflictMinutes = Math.max(0, expectedArrivalMinutes - currentStartMinutes);
  return {
    expectedArrivalMinutes,
    conflictMinutes,
    isConflict: conflictMinutes > 0,
  };
}

/** Return only the positive overlap duration for lightweight callers. */
export function calculateTimeConflictMinutes(
  previousStartMinutes: number,
  previousDurationMinutes: number,
  transitMinutes: number,
  currentStartMinutes: number,
): number {
  return calculateTimeConflict(previousStartMinutes, previousDurationMinutes, transitMinutes, currentStartMinutes).conflictMinutes;
}

/** Parse a PostgreSQL/form clock value into minutes after midnight. */
export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null;
  return hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
}

/** Format minutes after midnight as a normalized HH:mm clock value. */
export function formatClockMinutes(minutes: number): string {
  const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/**
 * Return a new list with every item after `fromIndex` shifted by the supplied
 * delay. The item at `fromIndex` is the delayed stop itself and is therefore
 * left unchanged; only its following stops move. Items without a valid clock
 * value remain unset and can still be inferred by the schedule builder.
 */
export function shiftSubsequentItems<T extends TimeShiftable>(
  items: readonly T[],
  fromIndex: number,
  delayMinutes: number,
): T[] {
  const delay = Number(delayMinutes);
  if (!Number.isFinite(delay) || delay === 0 || !Number.isInteger(fromIndex) || fromIndex < -1 || fromIndex >= items.length) {
    return items.map((item) => ({ ...item }));
  }

  return items.map((item, index) => {
    if (index <= fromIndex) return { ...item };
    const sourceValue = typeof item.time === 'string' && item.time.trim()
      ? item.time
      : typeof item.start_time === 'string' && item.start_time.trim()
        ? item.start_time
        : null;
    const parsed = parseClockMinutes(sourceValue);
    if (parsed === null) return { ...item };
    const shifted = formatClockMinutes(parsed + delay);
    if (typeof item.time === 'string' || 'time' in item) return { ...item, time: shifted };
    return { ...item, start_time: shifted };
  });
}
