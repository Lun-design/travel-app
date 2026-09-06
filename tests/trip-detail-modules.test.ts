import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('trip detail module boundaries', () => {
  it('route composes the data hook and focused panels', () => {
    const source = read('src/app/trips/[id].tsx');
    expect(source).toContain('useTripDetailData');
    expect(source).toContain('TripDetailHeader');
    expect(source).toContain('TripDetailTabs');
    expect(source).toContain('TimelinePanel');
    expect(source).toContain('ExpensesPanel');
  });

  it('data hook exposes loading, error, and reconnect refresh behavior', () => {
    const source = read('src/hooks/useTripDetailData.ts');
    expect(source).toContain('offlineSyncService.sync');
    expect(source).toContain('pendingSyncCount');
    expect(source).toContain('reload');
    expect(source).toContain('resolveConflict');
  });

  it('places Today Mode at the top of the timeline with completion and rescue actions', () => {
    const timeline = read('src/components/trip-detail/TimelinePanel.tsx');
    const card = read('src/components/TodayFocusCard.tsx');
    const rescue = read('src/components/OfflineRescueCardModal.tsx');

    expect(timeline).toContain('<TodayFocusCard');
    expect(timeline).toContain('onComplete');
    expect(card).toContain('findActiveOrNextSpot');
    expect(card).toContain('getGoogleMapsDirectionsUrl');
    expect(card).toContain('OfflineRescueCardModal');
    expect(rescue).toContain('離線備忘／救命卡');
  });
});
