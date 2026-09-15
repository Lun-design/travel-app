import { describe, expect, it } from 'vitest';
import { getSpotImageFallback, getSpotImageUrl, SPOT_IMAGE_FALLBACKS } from '../lib/spot-image';

describe('spot image resolver', () => {
  it('prefers an explicitly supplied image URL, including the API snake_case field', () => {
    expect(getSpotImageUrl({ name: '清水寺', imageUrl: 'https://cdn.example/temple.jpg' })).toBe('https://cdn.example/temple.jpg');
    expect(getSpotImageUrl({ location_name: '清水寺', image_url: 'https://cdn.example/legacy.jpg' })).toBe('https://cdn.example/legacy.jpg');
  });

  it('builds a destination-aware Unsplash Source query when no image exists', () => {
    const url = getSpotImageUrl({ name: '東京鐵塔', address: '東京都港區', category: 'spot' });
    expect(url.startsWith('https://source.unsplash.com/featured/300x300/?')).toBe(true);
    expect(decodeURIComponent(url)).toContain('東京鐵塔 東京都港區 spot');
  });

  it('returns a stable category fallback for unnamed spots', () => {
    expect(getSpotImageUrl({ category: 'food' })).toBe(SPOT_IMAGE_FALLBACKS.food);
    expect(getSpotImageFallback('hotel')).toBe(SPOT_IMAGE_FALLBACKS.hotel);
    expect(getSpotImageFallback('unknown-category')).toBe(SPOT_IMAGE_FALLBACKS.spot);
  });
});
