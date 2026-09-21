import { describe, expect, it } from 'vitest';
import { sanitizeLoadedItineraryItems } from '../lib/itinerary';

describe('loaded itinerary route-field cleanup', () => {
  it('removes legacy inter-stop travel fields while preserving stay duration', () => {
    const [item] = sanitizeLoadedItineraryItems([{
      id: 'stop-1',
      duration_minutes: 60,
      estimated_minutes: 445,
      travel_time: 445,
      route_duration_minutes: 445,
      route_distance_meters: 35_500,
    }]);

    expect(item).toMatchObject({ id: 'stop-1', duration_minutes: 60 });
    expect(item).not.toHaveProperty('estimated_minutes');
    expect(item).not.toHaveProperty('travel_time');
    expect(item).not.toHaveProperty('route_duration_minutes');
    expect(item).not.toHaveProperty('route_distance_meters');
  });
});

