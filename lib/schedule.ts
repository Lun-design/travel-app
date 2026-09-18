import { haversineDistanceKm, itineraryStartTime, sortItineraryItemsByStartTime, type OpeningHours, type ItineraryItem, type Weekday } from './itinerary';
import { addCalendarDays, getWeekdayForIsoDate, normalizeTimezone } from './timezone';
import { calculateTimeConflict } from './time-buffer';
import { checkOperatingHoursConflict } from './operating-hours';

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_DEPARTURE_TIME = '09:00';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const weekdays: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const shouldLogTimeConflictDebug = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

export type ScheduleItem = Pick<ItineraryItem, 'id' | 'day_number' | 'position' | 'time' | 'duration_minutes' | 'latitude' | 'longitude' | 'opening_hours'> & { start_time?: string | null; location_name?: string | null };
export type ScheduleContext = {
  tripStartDate: string;
  dayNumber: number;
  defaultDepartureTime?: string | null;
  averageSpeedKmh?: number;
  timezone?: string | null;
  /**
   * Route durations keyed by the originating item id.  Timeline consumers
   * populate this from the same route estimates shown in the route pill so
   * conflict calculations cannot fall back to a different (stale) estimate.
   */
  transitMinutesByFromId?: Readonly<Record<string, number | null | undefined>>;
  /** Enable the user-facing travel safety buffer. Defaults to 10 minutes. */
  includeBuffer?: boolean;
  defaultBufferMinutes?: number;
};
export type ScheduledItem = {
  item: ScheduleItem;
  scheduledStart: string;
  arrivalTime: string;
  departureTime: string;
  arrivalMinutes: number;
  departureMinutes: number;
  durationMinutes: number;
  travelMinutes: number;
  /** Extra safety time added after the route estimate. */
  bufferMinutes: number;
  /** Travel plus safety buffer used for arrival/conflict calculations. */
  effectiveTravelMinutes: number;
  estimated: boolean;
  openingWarning: boolean;
  overlapWarning: boolean;
  /** Minutes by which this stop starts before the previous stop can arrive. */
  conflictMinutes?: number;
};

export type TimeConflict = {
  id: string;
  previousId: string;
  conflictMinutes: number;
  expectedArrivalMinutes: number;
  actualStartMinutes: number;
  travelMinutes: number;
  bufferMinutes: number;
};

function resolveBufferMinutes(context: ScheduleContext): number {
  if (context.includeBuffer !== true) return 0;
  const configured = Number(context.defaultBufferMinutes ?? 10);
  return Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 10;
}

function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value) return null;
  // Supabase returns PostgreSQL `time` values as HH:mm:ss, while the form
  // stores the shorter HH:mm representation. Accept both forms so an
  // explicit start time is never mistaken for an unset value.
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60
    ? hours * 60 + minutes
    : null;
}

function formatTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function parseDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : null;
}

function weekdayFor(tripStartDate: string, dayNumber: number, timezone?: string | null): Weekday | null {
  const date = dateForDay(tripStartDate, dayNumber);
  return date ? getWeekdayForIsoDate(date, normalizeTimezone(timezone)) : null;
}

function dateForDay(tripStartDate: string, dayNumber: number): string | null {
  const start = parseDate(tripStartDate);
  if (start === null || !Number.isFinite(dayNumber)) return null;
  const date = new Date(start + (Math.max(1, dayNumber) - 1) * MINUTES_PER_DAY * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dateForArrival(tripStartDate: string, dayNumber: number, arrivalMinutes: number): string | null {
  const baseDate = dateForDay(tripStartDate, dayNumber);
  return baseDate ? addCalendarDays(baseDate, Math.floor(arrivalMinutes / MINUTES_PER_DAY)) : null;
}

function previousWeekday(day: Weekday): Weekday {
  const index = weekdays.indexOf(day);
  return weekdays[(index + weekdays.length - 1) % weekdays.length];
}

export function isOpenAt(openingHours: OpeningHours | null | undefined, date: string, time: string, timezone?: string | null): boolean {
  if (!openingHours) return true;
  const weekday = getWeekdayForIsoDate(date, normalizeTimezone(timezone));
  if (!weekday) return true;
  const minute = parseTime(time);
  if (minute === null) return true;
  const current = openingHours[weekday];
  const previous = openingHours[previousWeekday(weekday)];

  const previousOvernight = Array.isArray(previous?.periods) && previous.periods.some((period) => {
    const open = parseTime(period.open);
    const close = parseTime(period.close);
    return open !== null && close !== null && close <= open && minute < close;
  });
  if (previousOvernight) return true;
  if (!current) return true;
  if (current.closed) return false;
  if (!Array.isArray(current.periods) || !current.periods.length) return true;
  return current.periods.some((period) => {
    const open = parseTime(period.open);
    const close = parseTime(period.close);
    if (open === null || close === null) return false;
    if (close <= open) return minute >= open;
    return minute >= open && minute < close;
  });
}

function travelMinutes(from: ScheduleItem, to: ScheduleItem, averageSpeedKmh: number, routeMinutes?: number | null): number {
  if (routeMinutes !== null && routeMinutes !== undefined && Number.isFinite(routeMinutes) && routeMinutes >= 0) {
    return Math.round(routeMinutes);
  }
  if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) return 0;
  const distanceKm = haversineDistanceKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  );
  return Math.max(1, Math.round(distanceKm / averageSpeedKmh * 60));
}

/** Return detailed conflicts after comparing departure, travel, and next start. */
export function detectTimeConflictsDetailed(items: ScheduleItem[], context: ScheduleContext): TimeConflict[] {
  const ordered = sortItineraryItemsByStartTime(items);
  const speed = context.averageSpeedKmh && context.averageSpeedKmh > 0 ? context.averageSpeedKmh : 35;
  const fallbackStart = parseTime(context.defaultDepartureTime) ?? parseTime(DEFAULT_DEPARTURE_TIME)!;
  let previous: {
    item: ScheduleItem;
    startMinutes: number;
    durationMinutes: number;
    departureMinutes: number;
  } | null = null;
  const conflicts: TimeConflict[] = [];
  for (const [index, current] of ordered.entries()) {
    // `ordered` is the single source of truth: the previous stop for station
    // i is always the immediately preceding sorted entry, never the global
    // first item or an accumulated route elsewhere in the list.
    const previousItem = ordered[index - 1] ?? null;
    const explicitStart = parseTime(itineraryStartTime(current));
    const travel = previous
      ? travelMinutes(previous.item, current, speed, context.transitMinutesByFromId?.[previous.item.id])
      : 0;
    const buffer = previous ? resolveBufferMinutes(context) : 0;
    const effectiveTravel = travel + buffer;
    const earliestArrival: number = previous ? previous.departureMinutes + effectiveTravel : fallbackStart;
    const arrival: number = explicitStart ?? earliestArrival;
    const duration = Number.isFinite(current.duration_minutes) && (current.duration_minutes ?? 0) > 0 ? current.duration_minutes as number : DEFAULT_DURATION_MINUTES;
    // A conflict means that the activity windows overlap.  Travel time is
    // useful when estimating an unset start time, but it must not turn two
    // explicitly adjacent activities (for example 18:00–19:00 followed by
    // 19:00) into a false overlap warning.  Use the previous stop's actual
    // departure as the boundary; equality is a valid hand-off.
    // An explicit hand-off at the previous stop's departure is intentional
    // (for example 18:00-19:00 followed by 19:00), so do not flag it merely
    // because a route estimate would add a buffer. Other starts are checked
    // against departure plus the estimated travel time.
    const explicitHandoff = previous && buffer === 0 && explicitStart !== null && explicitStart === previous.departureMinutes;
    const conflict = previous && explicitStart !== null && !explicitHandoff
      ? calculateTimeConflict(previous.startMinutes, previous.durationMinutes, effectiveTravel, explicitStart)
      : null;
    if (shouldLogTimeConflictDebug) {
      console.log('[TimeConflict Debug]', {
        prevItem: previousItem,
        prevDuration: previous?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        currentItem: current,
        transitMinutes: travel,
        bufferMinutes: buffer,
        expectedArrival: earliestArrival,
        conflictMinutes: conflict?.conflictMinutes ?? 0,
      });
      console.log(`[Conflict Debug] Station ${index}:`, {
        prevName: previousItem?.location_name,
        prevStartTime: previousItem ? itineraryStartTime(previousItem) : null,
        // Log the normalised value used by the calculation rather than a raw
        // nullable DB field, so debugging reflects the real formula inputs.
        prevDuration: previous?.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        transitMinutes: travel,
        bufferMinutes: buffer,
        expectedArrivalMinutes: earliestArrival,
        currentName: current.location_name,
        currentStartTime: itineraryStartTime(current),
        conflictMinutes: conflict?.conflictMinutes ?? 0,
      });
    }
    if (conflict?.isConflict && previous && explicitStart !== null) {
      conflicts.push({
        id: current.id,
        previousId: previous.item.id,
        conflictMinutes: conflict.conflictMinutes,
        expectedArrivalMinutes: conflict.expectedArrivalMinutes,
        actualStartMinutes: explicitStart,
        travelMinutes: travel,
        bufferMinutes: buffer,
      });
    }
    previous = { item: current, startMinutes: arrival, durationMinutes: duration, departureMinutes: arrival + duration };
  }
  return conflicts;
}

/** Return IDs for callers that only need a warning flag. */
export function detectTimeConflicts(items: ScheduleItem[], context: ScheduleContext): string[] {
  return detectTimeConflictsDetailed(items, context).map((conflict) => conflict.id);
}

/** Explicitly named alias for consumers that need minutes and route context. */
export const calculateTimeConflicts = detectTimeConflictsDetailed;

export function buildDaySchedule(items: ScheduleItem[], context: ScheduleContext): ScheduledItem[] {
  const ordered = sortItineraryItemsByStartTime(items);
  const conflictById = new Map(detectTimeConflictsDetailed(ordered, context).map((conflict) => [conflict.id, conflict]));
  const speed = context.averageSpeedKmh && context.averageSpeedKmh > 0 ? context.averageSpeedKmh : 35;
  let previous: ScheduledItem | null = null;

  return ordered.map((current, index) => {
    const explicitStart = parseTime(itineraryStartTime(current));
    const fallbackStart = parseTime(context.defaultDepartureTime) ?? parseTime(DEFAULT_DEPARTURE_TIME)!;
    const travel = index && previous
      ? travelMinutes(previous.item, current, speed, context.transitMinutesByFromId?.[previous.item.id])
      : 0;
    const buffer = index && previous ? resolveBufferMinutes(context) : 0;
    const effectiveTravel = travel + buffer;
    const earliestArrival = previous ? previous.departureMinutes + effectiveTravel : fallbackStart;
    const arrivalMinutes = explicitStart ?? earliestArrival;
    const durationMinutes = Number.isFinite(current.duration_minutes) && (current.duration_minutes ?? 0) > 0
      ? current.duration_minutes as number
      : DEFAULT_DURATION_MINUTES;
    const arrivalDate = dateForArrival(context.tripStartDate, context.dayNumber, arrivalMinutes);
    const conflict = conflictById.get(current.id);
    const arrivalTime = formatTime(arrivalMinutes);
    const departureTime = formatTime(arrivalMinutes + durationMinutes);
    const openingConflict = arrivalDate
      ? checkOperatingHoursConflict(current, arrivalTime, departureTime, { date: arrivalDate, timezone: context.timezone })
      : null;
    const entry: ScheduledItem = {
      item: current,
      scheduledStart: formatTime(arrivalMinutes),
      arrivalTime: formatTime(arrivalMinutes),
      departureTime: formatTime(arrivalMinutes + durationMinutes),
      arrivalMinutes,
      departureMinutes: arrivalMinutes + durationMinutes,
      durationMinutes,
      travelMinutes: travel,
      estimated: explicitStart === null,
      openingWarning: Boolean(openingConflict?.conflict),
      overlapWarning: Boolean(conflict),
      conflictMinutes: conflict?.conflictMinutes ?? 0,
      bufferMinutes: buffer,
      effectiveTravelMinutes: effectiveTravel,
    };
    previous = entry;
    return entry;
  });
}
