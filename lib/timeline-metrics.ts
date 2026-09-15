import { calculateFallbackTravelMinutes } from './routes';
import { haversineDistanceKm, type ItineraryItem } from './itinerary';

export type TimelineMetrics = { spotCount: number; stayMinutes: number; transportMinutes: number };

export function calculateTimelineMetrics(items: Array<Pick<ItineraryItem, 'latitude' | 'longitude' | 'duration_minutes'>>): TimelineMetrics {
  let stayMinutes = 0;
  let transportMinutes = 0;
  let previous: { latitude: number; longitude: number } | null = null;
  for (const item of items) {
    const duration = Number(item.duration_minutes);
    if (Number.isFinite(duration) && duration > 0) stayMinutes += Math.round(duration);
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    if (valid && previous) {
      transportMinutes += calculateFallbackTravelMinutes(haversineDistanceKm(previous, { latitude, longitude }), 'DRIVING');
    }
    if (valid) previous = { latitude, longitude };
  }
  return { spotCount: items.length, stayMinutes, transportMinutes };
}

export function formatMetricDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}
