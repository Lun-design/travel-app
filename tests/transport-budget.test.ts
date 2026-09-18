import { describe, expect, it } from 'vitest';
import { calculateTimelineMetrics } from '../lib/timeline-metrics';
import { normalizeItineraryItemPayload } from '../lib/itinerary';
import { createRouteEstimator } from '../lib/routes';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('transport mode switching and itinerary cost summary', () => {
  it('keeps route estimates isolated by transport mode so switching recalculates the leg', async () => {
    let requests = 0;
    const fetcher = async (_input: string, init?: RequestInit) => {
      requests += 1;
      const body = JSON.parse(String(init?.body)) as { travelMode?: string };
      const duration = body.travelMode === 'WALK' ? '900s' : body.travelMode === 'TRANSIT' ? '600s' : '300s';
      return new Response(JSON.stringify({ routes: [{ distanceMeters: 1500, duration }] }), { status: 200 });
    };
    const estimator = createRouteEstimator({ apiKey: 'test-key', fetcher });
    const origin = { latitude: 25.033, longitude: 121.565, title: '起點' };
    const destination = { latitude: 25.047, longitude: 121.532, title: '終點' };

    const driving = await estimator.getRoute(origin, destination, 'DRIVING');
    const transit = await estimator.getRoute(origin, destination, 'TRANSIT');
    const walking = await estimator.getRoute(origin, destination, 'WALKING');

    expect(driving).toMatchObject({ mode: 'DRIVING', durationMinutes: 5 });
    expect(transit).toMatchObject({ mode: 'TRANSIT', durationMinutes: 10 });
    expect(walking).toMatchObject({ mode: 'WALKING', durationMinutes: 15 });
    expect(requests).toBe(3);
  });

  it('aggregates valid estimated costs for the day metrics', () => {
    const metrics = calculateTimelineMetrics([
      { latitude: null, longitude: null, duration_minutes: 60, estimated_cost: 350 },
      { latitude: null, longitude: null, duration_minutes: 30, estimated_cost: '120.5' as unknown as number },
      { latitude: null, longitude: null, duration_minutes: null, estimated_cost: null },
    ]);

    expect(metrics.estimatedCost).toBe(470.5);
  });

  it('normalizes a non-negative estimated cost before persistence', () => {
    const normalized = normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '大阪城',
      category: 'spot',
      estimated_cost: '1,250.50' as unknown as number,
    });

    expect(normalized.estimated_cost).toBe(1250.5);
    expect(normalizeItineraryItemPayload({
      trip_id: 'trip-1',
      created_by: 'user-1',
      location_name: '免費公園',
      category: 'spot',
      estimated_cost: -1,
    }).estimated_cost).toBeNull();
  });

  it('keeps the transport selector and budget summary wired into the timeline', () => {
    const shared = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');
    const panel = readFileSync(path.resolve(process.cwd(), 'src/components/trip-detail/TimelinePanel.tsx'), 'utf8');
    const modal = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryItemModal.tsx'), 'utf8');

    expect(shared).toContain("{ mode: 'TRANSIT', label: '電車'");
    expect(shared).toContain("{ mode: 'WALKING', label: '步行'");
    expect(shared).toContain('onRouteModeChange?.(segment.fromId, option.mode)');
    expect(panel).toContain('estimatedCost');
    expect(modal).toContain('estimated_cost');
  });
});
