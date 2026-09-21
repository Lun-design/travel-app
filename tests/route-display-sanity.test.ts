import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const timelineSource = readFileSync(resolve(process.cwd(), 'src/components/ItineraryTimeline.shared.tsx'), 'utf8');

describe('timeline route display safety', () => {
  it('sanitizes stale long-route estimates before rendering the pill', () => {
    expect(timelineSource).toContain('sanitizeRouteEstimateForDisplay(estimates[segment.fromId], segment.distanceKm, mode)');
    expect(timelineSource).toContain('formatRouteEstimateDuration');
  });

  it('clears the shared route caches when a new order is detected', () => {
    expect(timelineSource).toContain('export function clearRouteEstimateCaches()');
    expect(timelineSource).toContain('clearRouteEstimateCaches();');
  });

  it('does not build route segments from the 0,0 placeholder coordinate', () => {
    expect(timelineSource).toContain('&& !(latitude === 0 && longitude === 0);');
    expect(timelineSource).toContain('Number(item.latitude)');
  });
});
