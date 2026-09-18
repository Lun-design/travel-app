import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('route optimization preview UI contract', () => {
  it('exposes before/after order, route deltas, fixed-time badges, and apply/cancel actions', () => {
    const modal = read('src/components/RouteOptimizeModal.tsx');

    expect(modal).toContain('最佳化前');
    expect(modal).toContain('最佳化後');
    expect(modal).toContain('總交通時間');
    expect(modal).toContain('總移動距離');
    expect(modal).toContain('固定時間');
    expect(modal).toContain('accessibilityLabel="套用新順序"');
    expect(modal).toContain('accessibilityLabel="取消路線最佳化"');
    expect(modal).toContain('onApply');
  });

  it('wires the timeline suggestion to the new optimizer and preview apply callback', () => {
    const timeline = read('src/components/trip-detail/TimelinePanel.tsx');

    expect(timeline).toContain("import { optimizeItineraryOrder");
    expect(timeline).toContain('<RouteOptimizeModal');
    expect(timeline).toContain('showOptimizationSuggestion');
    expect(timeline).toContain('onApply={applyOptimization}');
    expect(timeline).toContain('conflictMinutes > 0');
  });

  it('applies the preview order through the parent persistence callback and closes after success', () => {
    const timeline = read('src/components/trip-detail/TimelinePanel.tsx');

    expect(timeline).toContain('const optimizedItems = optimizationPreview.result.items;');
    expect(timeline).toContain('onApplyRouteOptimization(optimizedItems)');
    expect(timeline).toContain('setOptimizationPreview(null);');
    expect(timeline).toContain("Alert.alert('路線最佳化完成'");
  });
});
