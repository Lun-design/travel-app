import type { OpeningHours, OpeningHoursDay, OpeningPeriod, Weekday } from './itinerary';

export const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'monday', label: '週一' },
  { key: 'tuesday', label: '週二' },
  { key: 'wednesday', label: '週三' },
  { key: 'thursday', label: '週四' },
  { key: 'friday', label: '週五' },
  { key: 'saturday', label: '週六' },
  { key: 'sunday', label: '週日' },
];

export type OpeningHoursDraft = Record<Weekday, { closed: boolean; periods: OpeningPeriod[] }>;

export function toOpeningHoursDraft(value: OpeningHours | null | undefined): OpeningHoursDraft {
  return Object.fromEntries(WEEKDAYS.map(({ key }) => {
    const day = value?.[key];
    return [key, {
      closed: day?.closed === true,
      periods: Array.isArray(day?.periods) ? day.periods.slice(0, 2).map((period) => ({ open: period.open, close: period.close })) : [],
    }];
  })) as OpeningHoursDraft;
}

export function draftToOpeningHours(draft: OpeningHoursDraft): OpeningHours | null {
  const hasConfiguration = WEEKDAYS.some(({ key }) => draft[key].closed || draft[key].periods.length > 0);
  if (!hasConfiguration) return null;
  return Object.fromEntries(WEEKDAYS.map(({ key }) => [key, {
    closed: draft[key].closed,
    periods: draft[key].closed ? [] : draft[key].periods.slice(0, 2),
  } satisfies OpeningHoursDay])) as OpeningHours;
}
