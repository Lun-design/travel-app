import { getGoogleMapsDirectionsUrl } from './map-links';
import { sortItineraryItemsByStartTime, type ItineraryItem } from './itinerary';

export type DayItineraryTrip = { title?: string | null; destination?: string | null };
export type DayItineraryShareItem = Pick<ItineraryItem, 'id' | 'day_number' | 'position' | 'time' | 'location_name' | 'address' | 'latitude' | 'longitude' | 'duration_minutes'> & { start_time?: string | null };

function formatTime(item: Pick<DayItineraryShareItem, 'time' | 'start_time'>): string {
  return item.time?.trim() || item.start_time?.trim() || '時間待定';
}

/** Build a plain-text day itinerary suitable for Clipboard, LINE, or Web Share. */
export function buildDayItineraryText(trip: DayItineraryTrip, items: DayItineraryShareItem[], day: number): string {
  const title = trip.title?.trim() || '我的旅程';
  const destination = trip.destination?.trim();
  const dayItems = sortItineraryItemsByStartTime(items.filter((item) => Number(item.day_number) === day));
  const heading = `${title}${destination ? `｜${destination}` : ''}｜Day ${day}`;
  if (!dayItems.length) return `${heading}\n尚未安排景點`;

  const lines = [heading, ''];
  dayItems.forEach((item, index) => {
    lines.push(`${index + 1}. ${formatTime(item)} ${item.location_name.trim() || '未命名景點'}`);
    if (item.address?.trim()) lines.push(`   地址：${item.address.trim()}`);
    if (Number.isFinite(item.duration_minutes) && (item.duration_minutes ?? 0) > 0) lines.push(`   停留：${Math.round(item.duration_minutes as number)} 分鐘`);
    const navigationUrl = getGoogleMapsDirectionsUrl(item.latitude, item.longitude);
    if (navigationUrl) lines.push(`   導航：${navigationUrl}`);
  });
  return lines.join('\n');
}
