import { haversineDistanceKm, type OpeningHours, type ItineraryItem, type Weekday } from './itinerary';

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_DEPARTURE_TIME = '09:00';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const weekdays: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type ScheduleItem = Pick<ItineraryItem, 'id' | 'day_number' | 'position' | 'time' | 'duration_minutes' | 'latitude' | 'longitude' | 'opening_hours'>;
export type ScheduleContext = {
  tripStartDate: string;
  dayNumber: number;
  defaultDepartureTime?: string | null;
  averageSpeedKmh?: number;
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
  estimated: boolean;
  openingWarning: boolean;
  overlapWarning: boolean;
};

function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
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

function weekdayFor(tripStartDate: string, dayNumber: number): Weekday | null {
  const start = parseDate(tripStartDate);
  if (start === null || !Number.isFinite(dayNumber)) return null;
  return weekdays[new Date(start + (Math.max(1, dayNumber) - 1) * MINUTES_PER_DAY * 60 * 1000).getUTCDay()];
}

function dateForDay(tripStartDate: string, dayNumber: number): string | null {
  const start = parseDate(tripStartDate);
  if (start === null || !Number.isFinite(dayNumber)) return null;
  const date = new Date(start + (Math.max(1, dayNumber) - 1) * MINUTES_PER_DAY * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dateForArrival(tripStartDate: string, dayNumber: number, arrivalMinutes: number): string | null {
  const baseDate = dateForDay(tripStartDate, dayNumber);
  const base = baseDate ? parseDate(baseDate) : null;
  if (base === null) return null;
  const date = new Date(base + Math.floor(arrivalMinutes / MINUTES_PER_DAY) * MINUTES_PER_DAY * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function previousWeekday(day: Weekday): Weekday {
  const index = weekdays.indexOf(day);
  return weekdays[(index + weekdays.length - 1) % weekdays.length];
}

export function isOpenAt(openingHours: OpeningHours | null | undefined, date: string, time: string): boolean {
  if (!openingHours) return true;
  const weekday = weekdayFor(date, 1);
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

function travelMinutes(from: ScheduleItem, to: ScheduleItem, averageSpeedKmh: number): number {
  if (from.latitude === null || from.longitude === null || to.latitude === null || to.longitude === null) return 0;
  const distanceKm = haversineDistanceKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  );
  return Math.max(1, Math.round(distanceKm / averageSpeedKmh * 60));
}

export function buildDaySchedule(items: ScheduleItem[], context: ScheduleContext): ScheduledItem[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const speed = context.averageSpeedKmh && context.averageSpeedKmh > 0 ? context.averageSpeedKmh : 35;
  let previous: ScheduledItem | null = null;

  return ordered.map((current, index) => {
    const explicitStart = parseTime(current.time);
    const fallbackStart = parseTime(context.defaultDepartureTime) ?? parseTime(DEFAULT_DEPARTURE_TIME)!;
    const travel = index && previous ? travelMinutes(previous.item, current, speed) : 0;
    const earliestArrival = previous ? previous.departureMinutes + travel : fallbackStart;
    const arrivalMinutes = explicitStart ?? earliestArrival;
    const durationMinutes = Number.isFinite(current.duration_minutes) && (current.duration_minutes ?? 0) > 0
      ? current.duration_minutes as number
      : DEFAULT_DURATION_MINUTES;
    const arrivalDate = dateForArrival(context.tripStartDate, context.dayNumber, arrivalMinutes);
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
      openingWarning: Boolean(current.opening_hours && arrivalDate && !isOpenAt(current.opening_hours, arrivalDate, formatTime(arrivalMinutes))),
      overlapWarning: Boolean(previous && explicitStart !== null && explicitStart < earliestArrival),
    };
    previous = entry;
    return entry;
  });
}
