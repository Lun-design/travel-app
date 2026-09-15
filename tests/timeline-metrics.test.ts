import { describe, expect, it } from 'vitest';
import { calculateTimelineMetrics, formatMetricDuration } from '../lib/timeline-metrics';

describe('timeline dashboard metrics', () => {
  it('summarizes stops, stay duration, and coordinate-based travel time', () => {
    const metrics = calculateTimelineMetrics([
      { latitude: 25.033, longitude: 121.565, duration_minutes: 90 },
      { latitude: 25.0478, longitude: 121.5319, duration_minutes: 60 },
      { latitude: null, longitude: null, duration_minutes: null },
    ]);
    expect(metrics.spotCount).toBe(3);
    expect(metrics.stayMinutes).toBe(150);
    expect(metrics.transportMinutes).toBeGreaterThan(0);
  });

  it('formats hours and minutes for compact display', () => {
    expect(formatMetricDuration(270)).toBe('4h 30m');
    expect(formatMetricDuration(0)).toBe('0m');
  });
});
