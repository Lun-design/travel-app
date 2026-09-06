import { haversineDistanceKm, type Coordinate } from './itinerary';
import { normalizeTimezone, toZonedDateTimeParts } from './timezone';
import type { ScheduledItem } from './schedule';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TodayFocusMode = 'active' | 'next' | 'countdown' | 'past' | 'complete' | 'empty';
export type TodayFocusResult = {
  mode: TodayFocusMode;
  scheduled: ScheduledItem | null;
  minutesRemaining: number | null;
  minutesUntil: number | null;
  daysUntil: number | null;
};
export type TodayFocusOptions = {
  scheduleDate: string | null | undefined;
  now?: Date;
  timezone?: string | null;
  completedIds?: ReadonlySet<string>;
};

function parseIsoDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function emptyResult(mode: TodayFocusMode, daysUntil: number | null = null): TodayFocusResult {
  return { mode, scheduled: null, minutesRemaining: null, minutesUntil: null, daysUntil };
}

/** Find the currently active or next uncompleted itinerary item for a day. */
export function findActiveOrNextSpot(schedule: ScheduledItem[], options: TodayFocusOptions): TodayFocusResult {
  if (!schedule.length) return emptyResult('empty');
  const available = schedule.filter((entry) => !options.completedIds?.has(entry.item.id));
  if (!available.length) return emptyResult('complete');

  const now = options.now ?? new Date();
  const zoned = toZonedDateTimeParts(now, normalizeTimezone(options.timezone));
  const targetDate = parseIsoDate(options.scheduleDate);
  const currentDate = parseIsoDate(zoned.date);
  if (targetDate === null || currentDate === null) {
    return { mode: 'next', scheduled: available[0], minutesRemaining: null, minutesUntil: null, daysUntil: null };
  }

  const daysUntil = Math.round((targetDate - currentDate) / DAY_MS);
  if (daysUntil > 0) return { mode: 'countdown', scheduled: available[0], minutesRemaining: null, minutesUntil: null, daysUntil };
  if (daysUntil < 0) return emptyResult('past', daysUntil);

  const nowMinutes = minutesFromTime(zoned.time);
  const active = available.find((entry) => entry.arrivalMinutes <= nowMinutes && nowMinutes < entry.departureMinutes);
  if (active) {
    return {
      mode: 'active',
      scheduled: active,
      minutesRemaining: Math.max(0, active.departureMinutes - nowMinutes),
      minutesUntil: 0,
      daysUntil: 0,
    };
  }

  const next = available.find((entry) => entry.arrivalMinutes > nowMinutes);
  if (next) {
    return {
      mode: 'next',
      scheduled: next,
      minutesRemaining: null,
      minutesUntil: Math.max(0, next.arrivalMinutes - nowMinutes),
      daysUntil: 0,
    };
  }
  return emptyResult('complete', 0);
}

function coordinatesOf(entry: ScheduledItem | undefined): Coordinate | null {
  if (!entry || entry.item.latitude == null || entry.item.longitude == null) return null;
  const latitude = Number(entry.item.latitude);
  const longitude = Number(entry.item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

/** Estimate the focus spot's distance from the previous itinerary spot. */
export function distanceToFocusSpot(focus: ScheduledItem | null | undefined, schedule: ScheduledItem[]): number | null {
  if (!focus) return null;
  const index = schedule.findIndex((entry) => entry.item.id === focus.item.id);
  if (index <= 0) return null;
  const from = coordinatesOf(schedule[index - 1]);
  const to = coordinatesOf(focus);
  return from && to ? haversineDistanceKm(from, to) : null;
}
