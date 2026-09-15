import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const timelineSource = () => readFileSync('src/components/trip-detail/TimelinePanel.tsx', 'utf8');
const tripDetailSource = () => readFileSync('src/app/trips/[id].tsx', 'utf8');

describe('route optimization UI callback chain', () => {
  it('binds the visible button to the real entry handler and logs every click', () => {
    const timeline = timelineSource();

    expect(timeline).toMatch(/async function openOptimizationPreview\(\) \{\s*console\.log\('\[OptimizeRoute\] Clicked!'\);/);
    expect(timeline).toContain('onPress={openOptimizationPreview}');
    expect(timeline).toContain("optimizationBusy ? '路線計算中…' : '🧭 最佳化今日路線'");
  });

  it('passes the apply callback from TripDetail instead of an empty function', () => {
    const detail = tripDetailSource();

    expect(detail).toContain('onApplyRouteOptimization={applyRouteOptimization}');
    expect(detail).not.toContain('onApplyRouteOptimization={() => {}}');
  });

  it('shows a user-facing alert when route optimization requirements are not met', () => {
    const timeline = timelineSource();

    expect(timeline).toContain("Alert.alert('無法最佳化路線'");
    expect(timeline).toContain('需至少 2 個具備經緯度的景點才能進行路線最佳化');
  });

  it('optimistically replaces route state and confirms a successful apply', () => {
    const detail = tripDetailSource();
    const timeline = timelineSource();

    expect(detail).toContain('replaceOptimizedRouteItems(currentItems, optimizedItems)');
    expect(timeline).toContain("Alert.alert('路線最佳化完成'");
  });
});
