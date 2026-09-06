import { addCalendarDays, normalizeTimezone } from './timezone';

const DEFAULT_DEPARTURE_TIME = '09:00';
const DEFAULT_DURATION_MINUTES = 60;

export type CalendarTrip = {
  id: string;
  title: string;
  destination?: string | null;
  start_date: string;
  end_date?: string | null;
  timezone?: string | null;
  default_departure_time?: string | null;
};

export type CalendarItem = {
  id: string;
  day_number: number;
  position?: number | null;
  time?: string | null;
  duration_minutes?: number | null;
  location_name: string;
  address?: string | null;
  notes?: string | null;
  category?: string | null;
};

export type CalendarExportOptions = {
  defaultDepartureTime?: string | null;
  reminderMinutes?: number;
  now?: Date;
  fileName?: string;
};

export function escapeIcsText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function parseTime(value: string | null | undefined): number | null {
  const match = typeof value === 'string' && /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
}

function formatTime(totalMinutes: number): string {
  const normalized = ((Math.trunc(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function formatIcsDateTime(date: string, time: string): string {
  const datePart = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '1970-01-01';
  const minute = parseTime(time) ?? 0;
  const [year, month, day] = datePart.split('-');
  return `${year}${month}${day}T${formatTime(minute).replace(':', '')}00`;
}

function formatIcsUtcTimestamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildEvent(trip: CalendarTrip, item: CalendarItem, timezone: string, options: CalendarExportOptions): string {
  const baseDate = addCalendarDays(trip.start_date, Math.max(1, Number(item.day_number) || 1) - 1) ?? trip.start_date;
  const startTime = item.time ?? options.defaultDepartureTime ?? trip.default_departure_time ?? DEFAULT_DEPARTURE_TIME;
  const startMinutes = parseTime(startTime) ?? parseTime(DEFAULT_DEPARTURE_TIME)!;
  const duration = Number.isFinite(item.duration_minutes) && (item.duration_minutes ?? 0) > 0
    ? Math.round(item.duration_minutes as number)
    : DEFAULT_DURATION_MINUTES;
  const endTotalMinutes = startMinutes + duration;
  const endDate = addCalendarDays(baseDate, Math.floor(endTotalMinutes / 1440)) ?? baseDate;
  const reminder = Number.isFinite(options.reminderMinutes) && (options.reminderMinutes ?? 0) > 0 ? Math.round(options.reminderMinutes as number) : 15;
  const summary = item.location_name || '行程項目';
  const description = [item.notes, item.category ? `類型：${item.category}` : null].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(item.id)}@travel-planner`,
    `DTSTAMP:${formatIcsUtcTimestamp(options.now ?? new Date())}`,
    `DTSTART;TZID=${timezone}:${formatIcsDateTime(baseDate, formatTime(startMinutes))}`,
    `DTEND;TZID=${timezone}:${formatIcsDateTime(endDate, formatTime(endTotalMinutes))}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(item.address ?? '')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`提醒：${summary}`)}`,
    `TRIGGER:-PT${reminder}M`,
    'END:VALARM',
    'END:VEVENT',
  ];
  return lines.join('\r\n');
}

export function buildTripIcs(trip: CalendarTrip, items: CalendarItem[], options: CalendarExportOptions = {}): string {
  const timezone = normalizeTimezone(trip.timezone);
  const events = [...items]
    .filter((item) => Number(item.day_number) > 0)
    .sort((left, right) => (left.day_number - right.day_number) || ((left.position ?? 0) - (right.position ?? 0)));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Travel Planner//Trip Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(trip.title)}`,
    `X-WR-TIMEZONE:${escapeIcsText(timezone)}`,
    ...events.flatMap((item) => buildEvent(trip, item, timezone, options).split('\r\n')),
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export async function exportTripCalendar(trip: CalendarTrip, items: CalendarItem[], options: CalendarExportOptions = {}): Promise<string> {
  const content = buildTripIcs(trip, items, options);
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return content;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options.fileName ?? `${trip.title || 'trip'}.ics`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return content;
}
