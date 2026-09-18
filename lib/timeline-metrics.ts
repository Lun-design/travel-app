import { calculateFallbackTravelMinutes } from './routes';
import { haversineDistanceKm, type ItineraryItem } from './itinerary';

export type TimelineMetrics = { spotCount: number; stayMinutes: number; transportMinutes: number; estimatedCost: number };

export function calculateTimelineMetrics(items: Array<Pick<ItineraryItem, 'latitude' | 'longitude' | 'duration_minutes'> & { estimated_cost?: number | string | null }>): TimelineMetrics {
  let stayMinutes = 0;
  let transportMinutes = 0;
  let estimatedCost = 0;
  let previous: { latitude: number; longitude: number } | null = null;
  for (const item of items) {
    const duration = Number(item.duration_minutes);
    if (Number.isFinite(duration) && duration > 0) stayMinutes += Math.round(duration);
    const cost = Number(typeof item.estimated_cost === 'string' ? item.estimated_cost.replace(/,/g, '') : item.estimated_cost);
    if (Number.isFinite(cost) && cost >= 0) estimatedCost += cost;
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    if (valid && previous) {
      const estimate = calculateFallbackTravelMinutes(haversineDistanceKm(previous, { latitude, longitude }), 'DRIVING');
      // Metrics are a same-day summary; ignore malformed/long-haul jumps and
      // use a conservative local-transfer estimate instead of exploding the bar.
      transportMinutes += estimate > 120 ? 15 : estimate;
    }
    if (valid) previous = { latitude, longitude };
  }
  // A single day cannot reasonably contain more than 24 hours of transfers;
  // cap malformed persisted coordinates/durations before formatting the bar.
  return { spotCount: items.length, stayMinutes, transportMinutes: Math.min(1440, transportMinutes), estimatedCost: Math.round(estimatedCost * 100) / 100 };
}

export function formatMetricDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}
