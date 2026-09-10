import { describe, expect, it } from 'vitest';
import { formatRouteDuration, formatRouteLegContext } from '../lib/route-connector';

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
});
