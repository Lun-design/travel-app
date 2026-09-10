import { describe, expect, it, vi } from 'vitest';
import { buildDayItineraryText } from '../lib/itinerary-share';
import { shareOrCopyText } from '../lib/share-actions';

describe('buildDayItineraryText', () => {
  it('sorts a day by start time and includes address, duration, and navigation link', () => {
    const text = buildDayItineraryText(
      { title: '東京小旅行', destination: '東京' },
      [
        { id: 'late', day_number: 1, position: 1, time: '14:00', location_name: '淺草寺', address: '東京都台東區', duration_minutes: 60, latitude: 35.7148, longitude: 139.7967 },
        { id: 'early', day_number: 1, position: 0, time: '09:00', location_name: '成田機場', address: null, duration_minutes: null, latitude: null, longitude: null },
      ],
      1,
    );

    expect(text.indexOf('09:00 成田機場')).toBeLessThan(text.indexOf('14:00 淺草寺'));
    expect(text).toContain('地址：東京都台東區');
    expect(text).toContain('停留：60 分鐘');
    expect(text).toContain('https://www.google.com/maps/dir/?api=1&destination=35.7148%2C139.7967&travelmode=driving');
  });

  it('returns a useful empty-day message and tolerates missing optional trip fields', () => {
    expect(buildDayItineraryText({ title: '' }, [], 3)).toContain('Day 3');
    expect(buildDayItineraryText({ title: '' }, [], 3)).toContain('尚未安排景點');
  });

  it('prefers native web share and falls back to clipboard', async () => {
    const webShare = vi.fn().mockResolvedValue(undefined);
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    await expect(shareOrCopyText('行程', { webShare, clipboardWrite })).resolves.toBe('shared');
    expect(webShare).toHaveBeenCalledWith({ title: '行程分享', text: '行程' });
    expect(clipboardWrite).not.toHaveBeenCalled();

    await expect(shareOrCopyText('行程', { clipboardWrite })).resolves.toBe('copied');
    expect(clipboardWrite).toHaveBeenCalledWith('行程');
  });
});
