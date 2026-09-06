import type { Weekday } from './itinerary';

export const DEFAULT_TIMEZONE = 'Asia/Taipei';

const WEEKDAY_BY_LABEL: Record<string, Weekday> = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
};
const WEEKDAY_BY_INDEX: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DESTINATION_TIMEZONE_HINTS: Array<{ keywords: string[]; timezone: string }> = [
  { keywords: ['日本', 'japan', '東京', '大阪', '京都', '沖繩', 'okinawa'], timezone: 'Asia/Tokyo' },
  { keywords: ['韓國', '南韓', 'korea', '首爾', 'seoul'], timezone: 'Asia/Seoul' },
  { keywords: ['香港', 'hong kong'], timezone: 'Asia/Hong_Kong' },
  { keywords: ['新加坡', 'singapore'], timezone: 'Asia/Singapore' },
  { keywords: ['泰國', 'thailand', '曼谷', 'bangkok'], timezone: 'Asia/Bangkok' },
  { keywords: ['巴黎', '法國', 'france', 'paris'], timezone: 'Europe/Paris' },
  { keywords: ['倫敦', '英國', 'uk', 'london'], timezone: 'Europe/London' },
  { keywords: ['紐約', '美國', 'usa', 'new york'], timezone: 'America/New_York' },
  { keywords: ['洛杉磯', 'los angeles'], timezone: 'America/Los_Angeles' },
];

export type ZonedDateTimeParts = { date: string; time: string; weekday: Weekday };

export function isValidTimezone(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && isValidTimezone(trimmed) ? trimmed : DEFAULT_TIMEZONE;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function formatPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? '';
}

export function toZonedDateTimeParts(value: Date, timezone: string | null | undefined = DEFAULT_TIMEZONE): ZonedDateTimeParts {
  const zone = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(value);
  const weekdayLabel = formatPart(parts, 'weekday').toLowerCase();
  return {
    date: `${formatPart(parts, 'year')}-${formatPart(parts, 'month')}-${formatPart(parts, 'day')}`,
    time: `${formatPart(parts, 'hour')}:${formatPart(parts, 'minute')}`,
    weekday: WEEKDAY_BY_LABEL[weekdayLabel] ?? 'monday',
  };
}

export function getWeekdayForIsoDate(value: string, timezone: string | null | undefined = DEFAULT_TIMEZONE): Weekday | null {
  const date = parseIsoDate(value);
  // An ISO trip date represents a destination calendar date. Do not format a
  // UTC instant here: UTC+14/UTC-12 could roll the weekday to an adjacent day.
  void timezone;
  return date ? WEEKDAY_BY_INDEX[date.getUTCDay()] : null;
}

export function addCalendarDays(value: string, offset: number): string | null {
  const date = parseIsoDate(value);
  if (!date || !Number.isFinite(offset)) return null;
  date.setUTCDate(date.getUTCDate() + Math.trunc(offset));
  return date.toISOString().slice(0, 10);
}

export function inferTimezoneFromDestination(destination: string | null | undefined): string {
  const normalized = (destination ?? '').trim().toLocaleLowerCase();
  const hint = DESTINATION_TIMEZONE_HINTS.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase())));
  return hint?.timezone ?? DEFAULT_TIMEZONE;
}
