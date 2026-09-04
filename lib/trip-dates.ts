const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return timestamp;
}

export function tripDayNumbers(startDate: string, endDate: string) {
  const start = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  if (start === null || end === null || end < start) return [1];
  const count = Math.floor((end - start) / DAY_MS) + 1;
  return Array.from({ length: count }, (_, index) => index + 1);
}
