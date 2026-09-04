const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return timestamp;
}

/** Return whether both dates are valid ISO calendar dates in chronological order. */
export function isValidTripDateRange(startDate: string, endDate: string) {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  return start !== null && end !== null && end >= start;
}

export function tripDayNumbers(startDate: string, endDate: string) {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (start === null || end === null || end < start) return [1];
  const count = Math.floor((end - start) / DAY_MS) + 1;
  return Array.from({ length: count }, (_, index) => index + 1);
}

/** Convert an ISO calendar date into the trip's one-based day number. */
export function tripDayNumberForDate(date: string, startDate: string, endDate?: string): number | null {
  const start = parseUtcDate(startDate);
  const target = parseUtcDate(date);
  if (start === null || target === null || target < start) return null;
  if (endDate !== undefined) {
    const end = parseUtcDate(endDate);
    if (end === null || target > end) return null;
  }
  const difference = target - start;
  if (difference % DAY_MS !== 0) return null;
  return Math.floor(difference / DAY_MS) + 1;
}

/** Convert a one-based itinerary Day number into an ISO calendar date. */
export function tripDateForDay(startDate: string, dayNumber: number): string | null {
  const start = parseUtcDate(startDate);
  if (start === null || !Number.isInteger(dayNumber) || dayNumber < 1) return null;
  const date = new Date(start + (dayNumber - 1) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
