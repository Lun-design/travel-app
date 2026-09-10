import { describe, expect, it } from 'vitest';
import { formatRouteDuration, formatRouteLegContext, getRouteOptimizationStatus } from '../lib/route-connector';

describe('route connector presentation', () => {
  it('formats short and long route durations for the timeline', () => {
    expect(formatRouteDuration(8)).toBe('8 分鐘');
    expect(formatRouteDuration(114)).toBe('1 小時 54 分鐘');
    expect(formatRouteDuration(120)).toBe('2 小時');
  });

  it('includes the origin and destination in the route context label', () => {
    expect(formatRouteLegContext({
      fromName: '新北市新莊國民運動中心',
      toName: '台中文心秀泰影城',
      durationMinutes: 114,
      mode: 'DRIVING',
    })).toBe('🚗 車程｜新北市新莊國民運動中心 ➔ 台中文心秀泰影城：車程約 1 小時 54 分鐘');
  });

  it('marks a zero-distance improvement as already optimal', () => {
    expect(getRouteOptimizationStatus(133.3, 133.3)).toEqual({
      label: '已是最佳順序',
      isOptimal: true,
    });
  });

  it('keeps a savings label when the optimized route is shorter', () => {
    expect(getRouteOptimizationStatus(10, 8.5)).toEqual({
      label: '預估節省 1.5 公里',
      isOptimal: false,
    });
  });
});
