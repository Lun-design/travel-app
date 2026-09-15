export const RESERVATION_TAG_OPTIONS = [
  { key: 'reserved', label: '✓ 已預約' },
  { key: 'ticketed', label: '🎟️ 已購票' },
  { key: 'must_visit', label: '⭐ 必去' },
] as const;

export type ReservationTag = typeof RESERVATION_TAG_OPTIONS[number]['key'];

export function normalizeReservationTags(value: unknown): ReservationTag[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(RESERVATION_TAG_OPTIONS.map((option) => option.key));
  return Array.from(new Set(value.filter((tag): tag is string => typeof tag === 'string' && allowed.has(tag)))) as ReservationTag[];
}

export function reservationTagLabels(value: unknown): string[] {
  const tags = normalizeReservationTags(value);
  return tags.map((tag) => RESERVATION_TAG_OPTIONS.find((option) => option.key === tag)?.label ?? tag);
}
