import type { ItineraryItem, ItineraryItemSaveInput } from './itinerary';

/** Explicit insertions and edits keep their position; simple additions append to their own day. */
export function positionNewItineraryItem(input: ItineraryItemSaveInput, items: readonly ItineraryItem[]): ItineraryItemSaveInput {
  if (input.id || input.position != null) return input;
  const day = input.day_number ?? 1;
  const max = items.reduce((value, item) => item.trip_id === input.trip_id && item.day_number === day && Number.isFinite(item.position) ? Math.max(value, item.position) : value, -1);
  return { ...input, position: max + 1 };
}
