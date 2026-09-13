import { parseFlightText, parseItineraryNote, type ParsedItineraryNote } from './ai-parser';
import { parseIcsCalendar } from './ics-import';
import { parseMarkdownItinerary } from './markdown-itinerary-parser';

export type ImportedItemDraft = {
  title: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  startTime?: string;
  durationMinutes?: number;
  category?: string;
  notes?: string;
};

export type ImportedDayDraft = {
  dayNumber: number;
  date?: string;
  label?: string;
  items: ImportedItemDraft[];
};

export type ImportedTripDraft = {
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  days: ImportedDayDraft[];
  warnings: string[];
};

export type ImportSource = 'text' | 'ics';

export type ImportTarget = {
  startDate: string;
  dayOffset: number;
};

export type ImportedItineraryPayload = {
  location_name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  day_number: number;
  time: string | null;
  duration_minutes: number | null;
  category: string;
  notes: string | null;
};

/** Parse a generic text/Markdown itinerary into the shared import contract. */
export function normalizeImportedText(input: string, referenceDate?: string): ImportedTripDraft {
  return parseMarkdownItinerary(input, referenceDate);
}

/** Select the deterministic parser for each supported import source. */
export function parseImportSource(input: string, source: ImportSource, referenceDate?: string): ImportedTripDraft {
  return source === 'ics' ? parseIcsCalendar(input) : normalizeImportedText(input, referenceDate);
}

function dateValue(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) ? value : 0;
}

function dateDifference(from: string, to: string): number {
  return Math.round((dateValue(to) - dateValue(from)) / 86_400_000);
}

function cleanText(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string): string {
  return cleanText(value).toLocaleLowerCase().replace(/[\s\-–—_.,，。:：/\\]+/g, '');
}

function safeCategory(value: string | undefined): string {
  const category = cleanText(value).toLowerCase();
  return ['spot', 'food', 'hotel', 'flight', 'trail', 'outdoor'].includes(category) ? category : 'spot';
}

function safeTime(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    : null;
}

/** Convert a parsed draft into safe itinerary_items fields for a target trip. */
export function mapDraftToTargetTrip(draft: ImportedTripDraft, target: ImportTarget): ImportedItineraryPayload[] {
  const firstDatedDay = draft.days.find((day) => day.date)?.date ?? draft.startDate;
  return draft.days.flatMap((day) => {
    const relativeDay = day.date && firstDatedDay
      ? dateDifference(firstDatedDay, day.date) + 1
      : day.dayNumber;
    const dayNumber = Math.max(1, Math.round(relativeDay + target.dayOffset));
    return day.items
      .map((item): ImportedItineraryPayload | null => {
        const title = cleanText(item.title);
        if (!title) return null;
        return {
          location_name: title,
          address: cleanText(item.address) || null,
          latitude: typeof item.latitude === 'number' && Number.isFinite(item.latitude) ? item.latitude : null,
          longitude: typeof item.longitude === 'number' && Number.isFinite(item.longitude) ? item.longitude : null,
          day_number: dayNumber,
          time: safeTime(item.startTime),
          duration_minutes: Number.isFinite(item.durationMinutes) && (item.durationMinutes ?? 0) > 0 ? Math.round(item.durationMinutes as number) : null,
          category: safeCategory(item.category),
          notes: cleanText(item.notes) || null,
        };
      })
      .filter((item): item is ImportedItineraryPayload => Boolean(item));
  });
}

type ExistingImportItem = { id?: string; day_number: number; location_name: string; time?: string | null };
type IncomingImportItem = { day_number: number; location_name: string; time?: string | null };

/** Return new items and duplicate items without mutating either input array. */
export function mergeImportedItems<T extends IncomingImportItem>(
  existing: readonly ExistingImportItem[],
  incoming: readonly T[],
): { added: T[]; skipped: T[] } {
  const keys = new Set(existing.map((item) => `${item.day_number}|${normalizeTitle(item.location_name)}|${safeTime(item.time ?? undefined) ?? ''}`));
  const added: T[] = [];
  const skipped: T[] = [];
  for (const item of incoming) {
    const key = `${item.day_number}|${normalizeTitle(item.location_name)}|${safeTime(item.time ?? undefined) ?? ''}`;
    if (keys.has(key)) skipped.push(item);
    else {
      keys.add(key);
      added.push(item);
    }
  }
  return { added, skipped };
}

/**
 * Best-effort mapping for short booking lines. Kept here so the generic parser
 * can share the existing flight/natural-language coverage without coupling UI.
 */
export function parseBookingLine(input: string, referenceDate?: string): ImportedItemDraft | null {
  const flight = parseFlightText(input, { referenceDate });
  if (flight) {
    return {
      title: [flight.airlineName, flight.flightNumber].filter(Boolean).join(' '),
      address: flight.arrivalAirport ?? undefined,
      startTime: flight.departureTime ?? undefined,
      durationMinutes: flight.durationMinutes ?? undefined,
      category: 'flight',
      notes: input.trim(),
    };
  }
  const note: ParsedItineraryNote | null = parseItineraryNote(input, { referenceDate });
  return note?.locationName ? { title: note.locationName, startTime: note.time ?? undefined, notes: input.trim() } : null;
}
