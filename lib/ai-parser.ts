/**
 * Lightweight parsers for common travel booking text and itinerary notes.
 *
 * The module intentionally has no network or platform dependencies so it can
 * be used from mobile, web, and unit tests alike. It returns normalized values
 * where possible and `null` for fields that are not present in the input.
 */

export type ParsedFlight = {
  airlineCode: string | null;
  airlineName: string | null;
  flightNumber: string;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  confirmationCode: string | null;
};

export type ParseFlightOptions = {
  referenceDate?: Date | string;
};

export type ParsedItineraryNote = {
  date: string | null;
  time: string | null;
  locationName: string | null;
  originalText: string;
};

export type ParseItineraryNoteOptions = {
  referenceDate?: Date | string;
};

export type FlightTitleInput = Pick<ParsedFlight, 'airlineName' | 'flightNumber' | 'departureAirport' | 'arrivalAirport'>;

export type FlightRouteInput = Pick<ParsedFlight, 'departureAirport' | 'arrivalAirport'>;

/** Format both endpoints when a complete route is available. */
export function formatFlightRoute({ departureAirport, arrivalAirport }: FlightRouteInput): string | null {
  const departure = departureAirport?.trim();
  const arrival = arrivalAirport?.trim();
  return departure && arrival ? `${departure} \u2192 ${arrival}` : null;
}

/** Build the display title used when a parsed flight is saved as an itinerary item. */
export function formatFlightTitle({ airlineName, flightNumber, departureAirport, arrivalAirport }: FlightTitleInput): string {
  const base = [airlineName?.trim(), flightNumber.trim()].filter(Boolean).join(' ');
  const route = formatFlightRoute({ departureAirport, arrivalAirport });
  return `${base || flightNumber.trim()}${route ? ` (${route})` : ''}`;
}

type Airline = { code: string; name: string };
type DateToken = { date: string; index: number; length: number };
type TimeToken = { time: string; index: number; length: number };
type TextToken = { value: string; index: number };

const AIRLINES: Record<string, Airline> = {
  JX: { code: 'JX', name: '\u661f\u5b87\u822a\u7a7a' },
  BR: { code: 'BR', name: '\u9577\u69ae\u822a\u7a7a' },
  CI: { code: 'CI', name: '\u4e2d\u83ef\u822a\u7a7a' },
  B7: { code: 'B7', name: '\u7acb\u69ae\u822a\u7a7a' },
  AE: { code: 'AE', name: '\u83ef\u4fe1\u822a\u7a7a' },
  IT: { code: 'IT', name: '\u53f0\u7063\u864e\u822a' },
  TW: { code: 'TW', name: "T'way Air" },
  TR: { code: 'TR', name: 'Scoot' },
};

const AIRLINE_NAMES: Array<{ matcher: RegExp; airline: Airline }> = [
  { matcher: /\u661f\u5b87(?:\u822a\u7a7a)?|starlux/i, airline: AIRLINES.JX },
  { matcher: /\u9577\u69ae(?:\u822a\u7a7a)?|eva\s*air/i, airline: AIRLINES.BR },
  { matcher: /\u83ef\u822a|\u4e2d\u83ef\u822a\u7a7a|china\s*airlines?/i, airline: AIRLINES.CI },
  { matcher: /\u7acb\u69ae(?:\u822a\u7a7a)?|uni\s*air/i, airline: AIRLINES.B7 },
  { matcher: /\u83ef\u4fe1(?:\u822a\u7a7a)?|mandarin\s*airlines?/i, airline: AIRLINES.AE },
  { matcher: /\u53f0\u7063\u864e\u822a|tigerair/i, airline: AIRLINES.IT },
];

const RELATIVE_DAYS: Record<string, number> = {
  '\u4eca\u5929': 0,
  '\u660e\u5929': 1,
  '\u5f8c\u5929': 2,
  '\u540e\u5929': 2,
  '\u5927\u5f8c\u5929': 3,
  '\u5927\u540e\u5929': 3,
};

const DATE_PATTERN = /(?:(\d{4})\s*\u5e74\s*(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65e5?|([12]\d{3})[/.\-](\d{1,2})[/.\-](\d{1,2})|(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65e5?|((?:0?[1-9]|1[0-2]))[/.\-](\d{1,2}))/g;
const TIME_PATTERN = /(?:(\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a|\u50cd\u665a)\s*)?(\d{1,2})(?:(?::|\uff1a)(\d{1,2})|\u9ede\s*(\u534a|\d{1,2})?\s*\u5206?|\u6642\s*(\u534a|\d{1,2})?\s*\u5206?)/gi;

const TIME_PERIOD_OFFSETS: Record<string, (hour: number) => number> = {
  '\u51cc\u6668': (hour) => hour === 12 ? 0 : hour,
  '\u65e9\u4e0a': (hour) => hour === 12 ? 0 : hour,
  '\u4e0a\u5348': (hour) => hour === 12 ? 0 : hour,
  '\u4e2d\u5348': (hour) => hour < 12 ? hour + 12 : hour,
  '\u4e0b\u5348': (hour) => hour < 12 ? hour + 12 : hour,
  '\u665a\u4e0a': (hour) => hour < 12 ? hour + 12 : hour,
  '\u50cd\u665a': (hour) => hour < 12 ? hour + 12 : hour,
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** Normalize a clock value to the itinerary's `HH:mm` format. */
export function formatTimeHHmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function dateFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function referenceDateParts(referenceDate?: Date | string): { year: number; month: number; day: number } {
  if (typeof referenceDate === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate.trim());
    if (match) {
      const parsed = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
      if (parsed) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    }
  }
  if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
    return { year: referenceDate.getFullYear(), month: referenceDate.getMonth() + 1, day: referenceDate.getDate() };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function addDays(date: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * 24 * 60 * 60 * 1000;
  const result = new Date(timestamp);
  return dateFromParts(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

function formatDateToken(match: RegExpExecArray, reference: { year: number; month: number; day: number }): string | null {
  if (match[1] && match[2] && match[3]) return dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  if (match[4] && match[5] && match[6]) return dateFromParts(Number(match[4]), Number(match[5]), Number(match[6]));
  if (match[7] && match[8]) return dateFromParts(reference.year, Number(match[7]), Number(match[8]));
  if (match[9] && match[10]) return dateFromParts(reference.year, Number(match[9]), Number(match[10]));
  return null;
}

function extractDateTokens(input: string, reference: { year: number; month: number; day: number }): DateToken[] {
  const tokens: DateToken[] = [];
  DATE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_PATTERN.exec(input))) {
    const date = formatDateToken(match, reference);
    if (date) tokens.push({ date, index: match.index, length: match[0].length });
  }
  DATE_PATTERN.lastIndex = 0;
  return tokens;
}

function normalizeTime(hour: number, minute: number, period?: string): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  let normalizedHour = hour;
  if (period) {
    const offset = TIME_PERIOD_OFFSETS[period.toLowerCase()];
    if (offset) normalizedHour = offset(hour);
  }
  if (normalizedHour < 0 || normalizedHour > 23) return null;
  return `${pad(normalizedHour)}:${pad(minute)}`;
}

function extractTimeTokens(input: string): TimeToken[] {
  const tokens: TimeToken[] = [];
  TIME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TIME_PATTERN.exec(input))) {
    const period = match[1];
    const hour = Number(match[2]);
    const minuteText = match[3] ?? match[4] ?? match[5];
    const minute = minuteText === '\u534a' ? 30 : minuteText ? Number(minuteText) : 0;
    const time = normalizeTime(hour, minute, period);
    if (time) tokens.push({ time, index: match.index, length: match[0].length });
  }
  TIME_PATTERN.lastIndex = 0;
  return tokens;
}

function detectAirline(input: string, code: string): Airline | null {
  const byCode = AIRLINES[code];
  if (byCode) return byCode;
  return AIRLINE_NAMES.find(({ matcher }) => matcher.test(input))?.airline ?? null;
}

function extractFlightNumber(input: string): { code: string; number: string; value: string } | null {
  const match = /(?:^|[^A-Za-z0-9])([A-Za-z]{2})\s*-?\s*(\d{1,4})(?!\d)/.exec(input);
  if (!match) return null;
  const code = match[1].toUpperCase();
  const number = match[2];
  return { code, number, value: `${code}${number}` };
}

function extractAirportTokens(input: string): TextToken[] {
  const iataTokens: TextToken[] = [];
  const iataPattern = /\b[A-Z]{3}\b/g;
  let match: RegExpExecArray | null;
  while ((match = iataPattern.exec(input))) iataTokens.push({ value: match[0], index: match.index });
  if (iataTokens.length >= 2) return iataTokens;

  const routeTokens: TextToken[] = [];
  const routePattern = /([\u4e00-\u9fffA-Za-z0-9·]{2,24})\s*(?:\u5230|\u81f3|\u5f80|\u98db\u5f80|\u2192|->)\s*([\u4e00-\u9fffA-Za-z0-9·]{2,24})/gu;
  while ((match = routePattern.exec(input))) {
    const departure = match[1].trim();
    const arrival = match[2].trim();
    routeTokens.push({ value: departure, index: match.index });
    routeTokens.push({ value: arrival, index: match.index + match[0].lastIndexOf(arrival) });
  }
  if (routeTokens.length >= 2) return routeTokens;

  const namedTokens: TextToken[] = [];
  const namedPattern = /[\u4e00-\u9fffA-Za-z]{2,24}\u6a5f\u5834/g;
  while ((match = namedPattern.exec(input))) namedTokens.push({ value: match[0], index: match.index });
  return iataTokens.length ? iataTokens : namedTokens;
}

function extractConfirmationCode(input: string): string | null {
  const labeled = /(?:\u78ba\u8a8d|\u8a02\u4f4d|\u9810\u8a02|\u9810\u7d04|booking|confirmation|record\s*locator|pnr)(?:\u78bc|\u4ee3\u865f|\u4ee3\u78bc|\u865f|\s*code)?\s*[:#：-]?\s*([A-Z0-9]{5,8})/i.exec(input);
  if (labeled) return labeled[1].toUpperCase();
  return null;
}

/** Parse a flight number and common booking-message fields. */
export function parseFlightText(input: string, options: ParseFlightOptions = {}): ParsedFlight | null {
  const text = input.trim();
  if (!text) return null;
  const flight = extractFlightNumber(text);
  if (!flight) return null;

  const reference = referenceDateParts(options.referenceDate);
  const dates = extractDateTokens(text, reference);
  const times = extractTimeTokens(text);
  const airports = extractAirportTokens(text);
  const airline = detectAirline(text, flight.code);
  const datesForFields = dates.map((token) => token.date);

  return {
    airlineCode: airline?.code ?? flight.code,
    airlineName: airline?.name ?? null,
    flightNumber: flight.value,
    departureDate: datesForFields[0] ?? null,
    departureTime: times[0]?.time ?? null,
    arrivalDate: datesForFields[1] ?? datesForFields[0] ?? null,
    arrivalTime: times[1]?.time ?? null,
    departureAirport: airports[0]?.value ?? null,
    arrivalAirport: airports[1]?.value ?? null,
    confirmationCode: extractConfirmationCode(text),
  };
}

function parseRelativeDate(input: string, reference: { year: number; month: number; day: number }): string | null {
  const base = dateFromParts(reference.year, reference.month, reference.day);
  if (!base) return null;
  const matched = Object.keys(RELATIVE_DAYS).sort((a, b) => b.length - a.length).find((value) => input.includes(value));
  return matched ? addDays(base, RELATIVE_DAYS[matched]) : null;
}

function extractLocationName(input: string, dateTokens: DateToken[], timeTokens: TimeToken[]): string | null {
  let candidate = input;
  const matchedRelative = Object.keys(RELATIVE_DAYS).sort((a, b) => b.length - a.length).find((value) => candidate.includes(value));
  const relativeToken = matchedRelative ? { value: matchedRelative, index: candidate.indexOf(matchedRelative), length: matchedRelative.length } : null;
  const tokensToRemove = [...dateTokens, ...timeTokens, ...(relativeToken ? [relativeToken] : [])]
    .sort((a, b) => b.index - a.index);
  for (const token of tokensToRemove) {
    candidate = candidate.slice(0, token.index) + candidate.slice(token.index + token.length);
  }

  const verbMatch = /(?:\u53bb|\u5230|\u524d\u5f80|\u53c3\u89c0|\u53c3\u89c2|\u62dc\u8a2a|\u5403|\u901b|\u4f4f|\u5165\u4f4f|\u62b5\u9054)\s*(?:\u5403|\u53bb|\u5230)?\s*(.+)$/u.exec(candidate);
  const hasActionVerb = Boolean(verbMatch);
  if (verbMatch) candidate = verbMatch[1];
  candidate = candidate
    .replace(/(?:\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a|\u50cd\u665a)/gu, '')
    .replace(/[，,、。；;：:！!？?\s]+/g, ' ')
    .replace(/^(?:\u9810\u8a08|\u5b89\u6392|\u4eca\u65e5|\u660e\u65e5|\u5f8c\u5929|\u540e\u5929)\s*/u, '')
    .trim();
  if (!hasActionVerb && !dateTokens.length && !timeTokens.length) return null;
  return candidate || null;
}

/** Parse a short natural-language itinerary note into date, time, and place. */
export function parseItineraryNote(input: string, options: ParseItineraryNoteOptions = {}): ParsedItineraryNote | null {
  const originalText = input.trim();
  if (!originalText) return null;
  const reference = referenceDateParts(options.referenceDate);
  const dateTokens = extractDateTokens(originalText, reference);
  const timeTokens = extractTimeTokens(originalText);
  const date = parseRelativeDate(originalText, reference) ?? dateTokens[0]?.date ?? (timeTokens.length ? dateFromParts(reference.year, reference.month, reference.day) : null);
  const locationName = extractLocationName(originalText, dateTokens, timeTokens);
  if (!date && !timeTokens[0]?.time && !locationName) return null;
  return {
    date,
    time: timeTokens[0]?.time ?? null,
    locationName,
    originalText,
  };
}
