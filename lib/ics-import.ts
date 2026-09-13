import type { ImportedDayDraft, ImportedItemDraft, ImportedTripDraft } from './itinerary-import';

const DAY_MS = 86_400_000;

function unescapeIcs(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\;,])/g, '$1').trim();
}

function dateValue(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) ? value : 0;
}

function addDays(date: string, count: number): string {
  return new Date(dateValue(date) + count * DAY_MS).toISOString().slice(0, 10);
}

function parseDateTime(value: string, valueIsDate: boolean): { date: string; time?: string; timestamp: number } | null {
  const token = value.trim();
  if (valueIsDate || /^\d{8}$/.test(token)) {
    const date = /^(\d{4})(\d{2})(\d{2})$/.exec(token);
    if (!date) return null;
    const iso = `${date[1]}-${date[2]}-${date[3]}`;
    return dateValue(iso) ? { date: iso, timestamp: dateValue(iso) } : null;
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(token);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59 || !dateValue(date)) return null;
  return { date, time: `${match[4]}:${match[5]}`, timestamp: Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second) };
}

function parseProperty(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const separator = line.indexOf(':');
  if (separator < 0) return null;
  const left = line.slice(0, separator);
  const value = unescapeIcs(line.slice(separator + 1));
  const [name, ...rawParams] = left.split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const [key, parameterValue] = param.split('=');
    if (key && parameterValue) params[key.toUpperCase()] = parameterValue;
  }
  return { name: name.toUpperCase(), params, value };
}

function categoryFor(title: string): string {
  if (/flight|air|航班|機場/i.test(title)) return 'flight';
  if (/hotel|飯店|酒店|住宿|旅館/i.test(title)) return 'hotel';
  if (/food|restaurant|cafe|咖啡|餐|美食|市場/i.test(title)) return 'food';
  if (/park|trail|beach|公園|步道|海邊|沙灘/i.test(title)) return 'outdoor';
  return 'spot';
}

type ParsedEvent = { uid?: string; title: string; address?: string; notes?: string; start: ReturnType<typeof parseDateTime>; end: ReturnType<typeof parseDateTime>; timezone?: string; allDay: boolean };

/** Parse a VCALENDAR string without network or browser dependencies. */
export function parseIcsCalendar(input: string): ImportedTripDraft {
  const unfolded: string[] = [];
  for (const line of input.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
    else unfolded.push(line.trimEnd());
  }
  const warnings: string[] = [];
  const events: ParsedEvent[] = [];
  let calendarTitle: string | undefined;
  let current: Record<string, { value: string; params: Record<string, string> }> | null = null;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (!current) continue;
      const title = current.SUMMARY?.value?.trim();
      const startProperty = current.DTSTART;
      if (!title || !startProperty) {
        warnings.push('略過缺少標題或開始時間的行事曆事件。');
        current = null;
        continue;
      }
      const allDay = startProperty.params.VALUE?.toUpperCase() === 'DATE' || /^\d{8}$/.test(startProperty.value);
      const start = parseDateTime(startProperty.value, allDay);
      const endProperty = current.DTEND;
      const end = endProperty ? parseDateTime(endProperty.value, endProperty.params.VALUE?.toUpperCase() === 'DATE' || /^\d{8}$/.test(endProperty.value)) : null;
      if (!start) warnings.push(`無法解析「${title}」的開始時間。`);
      else events.push({ uid: current.UID?.value, title, address: current.LOCATION?.value || undefined, notes: current.DESCRIPTION?.value || undefined, start, end, timezone: startProperty.params.TZID, allDay });
      current = null;
      continue;
    }
    const property = parseProperty(line);
    if (!property) continue;
    if (!current) {
      if (property.name === 'X-WR-CALNAME') calendarTitle = property.value;
      continue;
    }
    current[property.name] = { value: property.value, params: property.params };
  }
  if (!events.length) return { title: calendarTitle, days: [{ dayNumber: 1, items: [] }], warnings: [...warnings, '找不到可匯入的行事曆事件。'] };

  const validEvents = events.filter((event) => event.start) as Array<ParsedEvent & { start: NonNullable<ParsedEvent['start']> }>;
  validEvents.sort((left, right) => left.start.timestamp - right.start.timestamp);
  const firstDate = validEvents[0].start.date;
  const lastDate = validEvents[validEvents.length - 1].start.date;
  const dayCount = Math.max(1, Math.round((dateValue(lastDate) - dateValue(firstDate)) / DAY_MS) + 1);
  const dayMap = new Map<number, ImportedDayDraft>();
  for (let index = 0; index < dayCount; index += 1) dayMap.set(index + 1, { dayNumber: index + 1, date: addDays(firstDate, index), items: [] });
  for (const event of validEvents) {
    const dayNumber = Math.round((dateValue(event.start.date) - dateValue(firstDate)) / DAY_MS) + 1;
    const day = dayMap.get(dayNumber);
    if (!day) continue;
    const item: ImportedItemDraft = {
      title: event.title,
      address: event.address,
      startTime: event.start.time,
      durationMinutes: !event.allDay && event.end ? Math.max(1, Math.round((event.end.timestamp - event.start.timestamp) / 60_000)) : undefined,
      category: categoryFor(event.title),
      notes: event.notes,
    };
    day.items.push(item);
  }
  return {
    title: calendarTitle,
    startDate: firstDate,
    endDate: lastDate,
    timezone: validEvents.find((event) => event.timezone)?.timezone,
    days: [...dayMap.values()],
    warnings,
  };
}
