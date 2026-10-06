import type { ItineraryItem } from './itinerary';

/** Move one stop to another trip day, preserving its time and all other fields. */
export function moveItineraryItemAcrossDays(
  items: readonly ItineraryItem[],
  itemId: string,
  targetDay: number,
): ItineraryItem[] {
  if (!Number.isInteger(targetDay) || targetDay < 1) return items as ItineraryItem[];
  const moving = items.find((item) => item.id === itemId);
  if (!moving || moving.day_number === targetDay) return items as ItineraryItem[];

  const sameTrip = (item: ItineraryItem) => item.trip_id === moving.trip_id;
  const sourceItems = items
    .filter((item) => sameTrip(item) && item.day_number === moving.day_number && item.id !== itemId)
    .sort((left, right) => left.position - right.position);
  const targetItems = items
    .filter((item) => sameTrip(item) && item.day_number === targetDay && item.id !== itemId)
    .sort((left, right) => left.position - right.position);

  const positions = new Map<string, number>();
  sourceItems.forEach((item, index) => positions.set(item.id, index));
  targetItems.forEach((item, index) => positions.set(item.id, index));
  positions.set(itemId, targetItems.length);

  return items.map((item) => {
    if (item.id === itemId) return { ...item, day_number: targetDay, position: targetItems.length };
    if (sameTrip(item) && positions.has(item.id)) return { ...item, position: positions.get(item.id)! };
    return item;
  });
}
