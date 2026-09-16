import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveRouteSegmentLabels } from '../lib/itinerary';

describe('route segment context labels', () => {
  it('includes the origin and destination spot names for the transport pill', () => {
    const items = [
      { id: 'from', day_number: 1, position: 0, location_name: '新莊運動中心', time: '09:00', latitude: 25.02, longitude: 121.43 },
      { id: 'to', day_number: 1, position: 1, location_name: '台中文心秀泰', time: '12:00', latitude: 24.15, longitude: 120.65 },
    ] as any;

    const segment = resolveRouteSegmentLabels(items, { fromId: 'from', toId: 'to' });

    expect(segment).toMatchObject({
      fromTitle: '新莊運動中心',
      toTitle: '台中文心秀泰',
    });
  });

  it('renders both endpoint labels with one-line truncation guards', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'ItineraryTimeline.shared.tsx'), 'utf8');
    expect(source).toContain('style={styles.transitionContext}');
    expect(source).toContain('{segment.fromTitle}');
    expect(source).toContain('{segment.toTitle}');
    expect(source).toContain('numberOfLines={1} ellipsizeMode="tail"');
  });
});
