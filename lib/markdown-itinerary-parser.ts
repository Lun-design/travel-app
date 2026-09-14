import { formatFlightTitle, getFlightDestinationAddress, parseFlightText, parseItineraryNote } from './ai-parser';
import type { ImportedDayDraft, ImportedItemDraft, ImportedTripDraft } from './itinerary-import';

const DAY_MS = 86_400_000;
const DATE_TOKEN = /(?:(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})|(\d{1,2})\s*(?:\/|月)\s*(\d{1,2}))/g;
const TIME_TOKEN = /(?:(凌晨|早上|上午|中午|下午|傍晚|晚上)\s*)?(\d{1,2})(?::|：|點鐘|點|時)(\d{1,2})?/g;
const TIME_RANGE = /(?:(凌晨|早上|上午|中午|下午|傍晚|晚上)\s*)?(\d{1,2})(?::|：|點鐘|點|時)(\d{1,2})?\s*(?:～|~|至|到|-)\s*(?:(凌晨|早上|上午|中午|下午|傍晚|晚上)\s*)?(\d{1,2})(?::|：|點鐘|點|時)(\d{1,2})?/u;

function cleanMarkup(value: string): string {
  return value
    .replace(/\\([\\`*_{}\[\]()#+.!|>~-])/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/&#x20;|&nbsp;/gi, ' ')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const timestamp = Date.UTC(year, month - 1, day);
  const result = new Date(timestamp);
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateTokens(value: string, year: number): string[] {
  const result: string[] = [];
  let inferredYear = year;
  DATE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_TOKEN.exec(value))) {
    if (match[1]) inferredYear = Number(match[1]);
    const date = match[1]
      ? toIsoDate(inferredYear, Number(match[2]), Number(match[3]))
      : toIsoDate(inferredYear, Number(match[4]), Number(match[5]));
    if (date) result.push(date);
  }
  DATE_TOKEN.lastIndex = 0;
  return result;
}

function addDays(date: string, count: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

function parseRange(input: string, fallbackYear: number): { startDate?: string; endDate?: string } {
  const dates = parseDateTokens(input, fallbackYear);
  if (!dates.length) return {};
  return { startDate: dates[0], endDate: dates[1] ?? dates[0] };
}

function periodHour(hour: number, period?: string): number {
  if (!period) return hour;
  if (period === '中午' && hour < 6) return hour + 12;
  if ((period === '下午' || period === '傍晚' || period === '晚上') && hour < 12) return hour + 12;
  return hour === 12 && (period === '凌晨' || period === '早上' || period === '上午') ? 0 : hour;
}

function parseClock(period: string | undefined, hourText: string, minuteText?: string): string | null {
  const hour = periodHour(Number(hourText), period);
  const minute = minuteText ? Number(minuteText) : 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function minutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function durationBetween(start: string, end: string): number {
  let result = minutes(end) - minutes(start);
  if (result <= 0) result += 24 * 60;
  return result;
}

function extractTimes(value: string): { startTime?: string; durationMinutes?: number; startIndex: number } {
  const range = TIME_RANGE.exec(value);
  if (range) {
    const startTime = parseClock(range[1], range[2], range[3]);
    const endTime = parseClock(range[4], range[5], range[6]);
    return { startTime: startTime ?? undefined, durationMinutes: startTime && endTime ? durationBetween(startTime, endTime) : undefined, startIndex: range.index + range[0].length };
  }
  TIME_TOKEN.lastIndex = 0;
  const single = TIME_TOKEN.exec(value);
  TIME_TOKEN.lastIndex = 0;
  if (!single) return { startIndex: 0 };
  return { startTime: parseClock(single[1], single[2], single[3]) ?? undefined, startIndex: single.index + single[0].length };
}

function categoryFor(title: string): string {
  if (/航班|機場|airport|\b[A-Z]{2}\s*\d{1,4}\b/i.test(title)) return 'flight';
  if (/飯店|酒店|住宿|旅館|hotel|民宿/i.test(title)) return 'hotel';
  if (/吃|餐|市場|美食|拉麵|咖啡|甜點|居酒屋|烤肉|燒肉|火鍋|餐廳|food|cafe|restaurant/i.test(title)) return 'food';
  if (/步道|登山|公園|海邊|沙灘|露營|農場|吊橋|自然/i.test(title)) return 'outdoor';
  return 'spot';
}

/** Activities without a concrete place should enrich a nearby stop's notes. */
function isAbstractActivity(title: string): boolean {
  const value = title.replace(/[\s、，,。；;：:]+/gu, '').trim();
  return /^(?:早餐|早午餐|午餐|晚餐|吃早餐|吃早午餐|吃午餐|吃晚餐|飯店|酒店|住宿|旅館|休息|補眠|補眠休息|退房|入住|找咖啡廳|找咖啡廳休息|咖啡廳休息|完晚餐)$/u.test(value);
}

function locationFromLine(value: string, timeEnd: number): string {
  let candidate = value.slice(timeEnd).replace(/^[\s:：|｜、，,。；;]+/, '').trim();
  candidate = candidate.replace(/^(?:預計|安排|早上|上午|中午|下午|傍晚|晚上|凌晨|morning|afternoon|evening|night)\s*/iu, '');
  const action = /^(?:抵達|前往|到|去|參拜|參觀|逛|入住|返回|搭乘|租|吃|看|拍攝|visit(?:\s+to)?|head\s+to|go\s+to)\s*/iu.exec(candidate);
  if (action && candidate.slice(action[0].length).trim() && !/^[、，,。]/.test(candidate.slice(action[0].length))) candidate = candidate.slice(action[0].length);
  const segments = candidate.split(/[、，,。；;｜|]/u).map((segment) => {
    const trimmed = segment.trim();
    const segmentAction = /^(?:抵達|前往|到|去|參拜|參觀|逛|入住|返回|搭乘|租|吃|看|拍攝)\s*/u.exec(trimmed);
    const withoutAction = segmentAction && trimmed.slice(segmentAction[0].length).trim() ? trimmed.slice(segmentAction[0].length) : trimmed;
    return withoutAction.replace(/(?:逛街|互拍|散步|看夕景).*$/u, '').replace(/(?:回飯店|回酒店)$/u, '').trim();
  }).filter(Boolean);
  return segments.find((segment) => !isAbstractActivity(segment)) ?? segments[0] ?? '';
}

function parseItemLine(rawLine: string, referenceDate?: string, label?: string, previous?: ImportedItemDraft): ImportedItemDraft | null {
  const line = cleanMarkup(rawLine.replace(/^[\-•●▪︎]\s*/, ''));
  if (!line || /^(?:行前準備|備註|注意事項|預估時間|預留約|依購買|出發前確認|確認|當天不安排)|可考慮加購|不安排遠程|門票須另外|除航班時間外|以實際.*為準/u.test(line)) return null;

  const flight = parseFlightText(line, { referenceDate });
  if (flight) {
    return {
      title: formatFlightTitle(flight),
      address: getFlightDestinationAddress(flight) ?? undefined,
      startTime: flight.departureTime ?? undefined,
      durationMinutes: flight.durationMinutes ?? undefined,
      category: 'flight',
      notes: line,
    };
  }

  const parsed = extractTimes(line);
  const note = parseItineraryNote(line, { referenceDate });
  let title = locationFromLine(line, parsed.startIndex) || note?.locationName || line;
  const contextPlaces = (label ?? '').split(/[、，,｜|]/).map(part => part.replace(/(?:互拍|夜景|逛街|散步).*$/, '').trim());
  if (/^(?:參拜|兩人互拍|拍照)$/.test(title)) {
    title = contextPlaces.find(part => /寺|大社|神社|神宮|教堂|古蹟/.test(part)) || previous?.title || '';
  } else if (/園區|整天留給/.test(title)) {
    title = contextPlaces.find(part => /園|影城|USJ|Disney/i.test(part)) || title;
  }
  title = title.replace(/^[\s、，,：:。]+/, '').trim();
  if (!title) return null;
  const duration = /(?:預留|停留|約)\s*(\d+(?:\.\d+)?)\s*(?:[～~至-]\s*(\d+(?:\.\d+)?))?\s*(小時|分鐘)/.exec(line);
  return {
    title,
    startTime: parsed.startTime,
    durationMinutes: parsed.durationMinutes ?? (duration ? Number(duration[2] ?? duration[1]) * (duration[3] === '小時' ? 60 : 1) : undefined),
    category: categoryFor(title),
    notes: line,
  };
}

/** Fill only missing clocks in source order, bounded by the next explicit clock. */
function assignSuggestedTimes(day: ImportedDayDraft, warnings: string[]) {
  let cursor = 9 * 60;
  for (let index = 0; index < day.items.length; index += 1) {
    const item = day.items[index];
    if (item.startTime) { cursor = minutes(item.startTime) + (item.durationMinutes ?? 60); continue; }
    const nextIndex = day.items.findIndex((entry, i) => i > index && !!entry.startTime);
    const next = nextIndex >= 0 ? minutes(day.items[nextIndex].startTime!) : 24 * 60;
    const remaining = (nextIndex < 0 ? day.items.length : nextIndex) - index;
    const period = item.notes ?? '';
    const preferred = /早餐|早上|morning/i.test(period) ? 8 * 60 : /上午/.test(period) ? 9 * 60 : /中午|午餐/.test(period) ? 12 * 60 : /下午|afternoon/i.test(period) ? 14 * 60 : /傍晚/.test(period) ? 17 * 60 : /晚上|晚餐|evening/i.test(period) ? 19 * 60 : cursor;
    const previous = index ? minutes(day.items[index - 1].startTime!) : 0;
    const latest = next - remaining;
    if (latest < previous) { warnings.push(`Day ${day.dayNumber} 的時間安排過密，請確認「${item.title}」與固定時間。`); }
    const start = Math.max(0, Math.min(Math.max(index ? cursor : 0, preferred), Math.max(previous, next - remaining * 60)));
    const duration = Math.max(1, Math.min(item.durationMinutes ?? 60, Math.max(1, Math.floor((next - start) / remaining))));
    item.startTime = `${pad(Math.floor(Math.min(start, 1439) / 60))}:${pad(Math.min(start, 1439) % 60)}`;
    item.durationMinutes = duration;
    item.notes = `${item.notes ?? ''}\n建議時間 ${item.startTime}（自動安排，請確認）`;
    cursor = start + duration;
  }
}

function ensureDay(days: Map<number, ImportedDayDraft>, dayNumber: number, date?: string, label?: string): ImportedDayDraft {
  const existing = days.get(dayNumber);
  if (existing) {
    if (date) existing.date = date;
    if (label) existing.label = label;
    return existing;
  }
  const day: ImportedDayDraft = { dayNumber, date, label, items: [] };
  days.set(dayNumber, day);
  return day;
}

/** Parse generic travel notes; no city or destination is hardcoded. */
export function parseMarkdownItinerary(input: string, referenceDate?: string): ImportedTripDraft {
  const lines = input.replace(/\r\n?/g, '\n').split('\n').map(cleanMarkup).filter(Boolean);
  const fallbackYear = Number(referenceDate?.slice(0, 4)) || new Date().getFullYear();
  const rangeLine = lines.find((line) => parseDateTokens(line, fallbackYear).length >= 2) ?? '';
  const range = parseRange(rangeLine, fallbackYear);
  const days = new Map<number, ImportedDayDraft>();
  let activeDay: ImportedDayDraft | undefined;
  let inPreparationSection = false;
  let pendingAbstractNote = '';
  const firstLine = lines[0] ?? '';
  const firstIsItem = /^(?:Day\s*\d+|\d{1,2}:|[-•])|\b[A-Z]{2}\d{1,4}\b/i.test(firstLine);
  const title = firstIsItem ? undefined : cleanMarkup(firstLine.split(/[|｜]/u)[0]).replace(/\s*\d+\s*(?:天|日)\s*\d*\s*(?:夜)?\s*$/u, '').trim() || undefined;
  const destination = title?.split(/\s+/u)[0] || undefined;

  for (const line of lines) {
    // The first heading/range describes the trip itself, not an itinerary
    // item. Keeping this structural check generic avoids city-specific rules.
    if ((!firstIsItem && line === firstLine) || line === rangeLine) continue;
    if (/^(?:去程|回程|住宿)[：:]/.test(line)) continue;
    if (/^(?:行前準備|備註|注意事項|packing|notes)/iu.test(line)) {
      inPreparationSection = true;
      activeDay = undefined;
      continue;
    }
    const heading = /^\**(?:Day\s*)(\d+)\s*(?:[：:|｜-]\s*)?([^\n]*)\**$/iu.exec(line);
    const headingDates = parseDateTokens(line, Number(range.startDate?.slice(0, 4)) || fallbackYear);
    const dayNumberFromLabel = heading?.[1] ? Number(heading[1]) : undefined;
    const isHeading = /^\**(?:Day\s*\d+|\d{1,2}\s*[/月]\s*\d{1,2}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})/iu.test(line) || /^\*\*.+\*\*$/.test(line);
    if (isHeading && (headingDates.length || dayNumberFromLabel)) {
      inPreparationSection = false;
      pendingAbstractNote = '';
      const dayNumber = dayNumberFromLabel ?? (range.startDate ? Math.max(1, Math.round((Date.parse(`${headingDates[0]}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / DAY_MS) + 1) : days.size + 1);
      const inferredDate = headingDates[0] ?? (range.startDate ? addDays(range.startDate, dayNumber - 1) : undefined);
      const label = line.split(/[|｜]/u)[1]?.trim() || heading?.[2]?.trim();
      activeDay = ensureDay(days, dayNumber, inferredDate, label);
      continue;
    }
    if (inPreparationSection || /^\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\s*[～~-]/u.test(line)) continue;
    const lineDates = parseDateTokens(line, Number(range.startDate?.slice(0, 4)) || fallbackYear);
    if (!activeDay && lineDates.length) {
      const dayNumber = range.startDate ? Math.max(1, Math.round((Date.parse(`${lineDates[0]}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / DAY_MS) + 1) : days.size + 1;
      activeDay = ensureDay(days, dayNumber, lineDates[0]);
    }
    if (!activeDay) {
      activeDay = ensureDay(days, 1, range.startDate);
    }
    const item = parseItemLine(line, activeDay.date ?? range.startDate, activeDay.label, activeDay.items.at(-1));
    if (item && item.title !== title) {
      if (isAbstractActivity(item.title)) {
        const previous = activeDay.items.at(-1);
        if (previous) previous.notes = `${previous.notes ?? ''}\n${item.notes ?? item.title}`.trim();
        else pendingAbstractNote = `${pendingAbstractNote}\n${item.notes ?? item.title}`.trim();
      } else {
        if (pendingAbstractNote) {
          item.notes = `${pendingAbstractNote}\n${item.notes ?? ''}`.trim();
          pendingAbstractNote = '';
        }
        activeDay.items.push(item);
      }
    }
    else if (!item && activeDay.items.length) activeDay.items[activeDay.items.length - 1].notes += `\n${line}`;
  }

  if (range.startDate && range.endDate) {
    const count = Math.max(1, Math.round((dateValue(range.endDate) - dateValue(range.startDate)) / DAY_MS) + 1);
    for (let index = 0; index < count; index += 1) ensureDay(days, index + 1, addDays(range.startDate, index));
  }
  // Preserve a contiguous day selector even when the source only includes
  // selected headings (for example Day 1 and Day 3 with no Day 2 section).
  const highestDayNumber = Math.max(...days.keys(), 1);
  for (let dayNumber = 1; dayNumber <= highestDayNumber; dayNumber += 1) {
    ensureDay(days, dayNumber, range.startDate ? addDays(range.startDate, dayNumber - 1) : undefined);
  }
  if (!days.size) ensureDay(days, 1, range.startDate);
  const sortedDays = [...days.values()].sort((left, right) => left.dayNumber - right.dayNumber);
  const warnings: string[] = [];
  sortedDays.forEach(day => assignSuggestedTimes(day, warnings));
  const firstDate = sortedDays.find((day) => day.date)?.date ?? range.startDate;
  const lastDate = [...sortedDays].reverse().find((day) => day.date)?.date ?? range.endDate ?? firstDate;
  return {
    title,
    destination,
    startDate: firstDate,
    endDate: lastDate,
    days: sortedDays,
    warnings: sortedDays.every((day) => day.items.length === 0) ? ['找不到可匯入的景點或活動，請確認文字格式。'] : warnings,
  };
}

function dateValue(date: string): number {
  const result = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(result) ? result : 0;
}
