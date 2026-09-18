import type { ItineraryItem, OpeningHours, Weekday } from './itinerary';
import { getWeekdayForIsoDate, normalizeTimezone } from './timezone';

const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type OperatingHoursCheckOptions = {
  /** Destination calendar date used to select the weekly opening interval. */
  date?: string | null;
  timezone?: string | null;
};

export type OperatingHoursConflictReason = 'closed' | 'outside-hours' | null;

export type OperatingHoursConflict = {
  conflict: boolean;
  reason: OperatingHoursConflictReason;
  arrivalTime: string | null;
  departureTime: string | null;
  weekday: Weekday | null;
};

type OpeningHoursItem = Pick<ItineraryItem, 'opening_hours'> | { opening_hours?: OpeningHours | null };

function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = CLOCK_PATTERN.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return hour * 60 + minute + (second >= 30 ? 1 : 0);
}

function previousWeekday(day: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length];
}

function isWithinPeriod(minute: number, open: string, close: string): boolean {
  const openMinutes = parseClock(open);
  const closeMinutes = parseClock(close);
  if (openMinutes === null || closeMinutes === null) return false;
  // 00:00-00:00 is the representation used by the Google all-day parser.
  if (openMinutes === closeMinutes) return true;
  if (closeMinutes < openMinutes) return minute >= openMinutes || minute < closeMinutes;
  return minute >= openMinutes && minute < closeMinutes;
}

/** Return whether a weekly opening-hours object is open at a local clock time. */
export function isOperatingAt(openingHours: OpeningHours | null | undefined, weekday: Weekday, time: string): boolean {
  if (!openingHours) return true;
  const minute = parseClock(time);
  if (minute === null) return true;
  const current = openingHours[weekday];
  const previous = openingHours[previousWeekday(weekday)];
  const previousOvernight = previous?.closed !== true && (previous?.periods ?? []).some((period) => {
    const open = parseClock(period.open);
    const close = parseClock(period.close);
    return open !== null && close !== null && close < open && minute < close;
  });
  if (previousOvernight) return true;
  if (!current || current.closed !== true && (!current.periods || current.periods.length === 0)) return true;
  if (current.closed) return false;
  return (current.periods ?? []).some((period) => isWithinPeriod(minute, period.open, period.close));
}

/**
 * Compare an itinerary stop's predicted arrival/departure against its weekly
 * opening hours. Missing hours or an invalid date are treated as unknown and
 * therefore do not block the itinerary.
 */
export function checkOperatingHoursConflict(
  item: OpeningHoursItem,
  arrivalTime: string | null | undefined,
  departureTime: string | null | undefined,
  options: OperatingHoursCheckOptions = {},
): OperatingHoursConflict {
  const arrival = typeof arrivalTime === 'string' && arrivalTime.trim() ? arrivalTime.trim() : null;
  const departure = typeof departureTime === 'string' && departureTime.trim() ? departureTime.trim() : arrival;
  const openingHours = item.opening_hours ?? null;
  const weekday = options.date ? getWeekdayForIsoDate(options.date, normalizeTimezone(options.timezone)) : null;
  if (!openingHours || !weekday || !arrival || !departure) {
    return { conflict: false, reason: null, arrivalTime: arrival, departureTime: departure, weekday };
  }
  const day = openingHours[weekday];
  if (day?.closed) {
    return { conflict: true, reason: 'closed', arrivalTime: arrival, departureTime: departure, weekday };
  }
  const arrivalOpen = isOperatingAt(openingHours, weekday, arrival);
  const departureOpen = isOperatingAt(openingHours, weekday, departure);
  return {
    conflict: !arrivalOpen || !departureOpen,
    reason: !arrivalOpen || !departureOpen ? 'outside-hours' : null,
    arrivalTime: arrival,
    departureTime: departure,
    weekday,
  };
}
