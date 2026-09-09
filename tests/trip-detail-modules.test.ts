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

  it('sanitizes persisted weather before rendering forecast cards and logs both sources', () => {
    const timeline = read('src/components/trip-detail/TimelinePanel.tsx');
    const card = read('src/components/TodayFocusCard.tsx');

    expect(card).toContain('sanitizePersistedWeather');
    expect(card).toContain("REAL RENDER COMPONENT WEATHER:");
    expect(card).toContain("TodayFocusCard Raw Weather:");
    expect(card).toContain("TodayFocusCard Sanitized Forecast:");
    expect(timeline).toContain('persistedWeather');
  });

  it('offers an expandable daytime rain timeline and labels cached weather', () => {
    const card = read('src/components/TodayFocusCard.tsx');
    expect(card).toContain('expandedHourlyDate');
    expect(card).toContain('setExpandedHourlyDate');
    expect(card).toContain('目前為離線氣象資料');
    expect(card).toContain('day.hourly');
  });

  it('renders the outdoor rain alert with an indoor-plan action', () => {
    const card = read('src/components/TodayFocusCard.tsx');
    expect(card).toContain('getOutdoorRainAlert');
    expect(card).toContain('查看室內備案');
    expect(card).toContain('onPress');
  });
});
