import { describe, expect, it } from 'vitest';
import { getSpotImageFallback, getSpotImageTags, getSpotImageUrl, SPOT_IMAGE_FALLBACKS } from '../lib/spot-image';

describe('spot image resolver', () => {
  it('prefers an explicitly supplied image URL, including the API snake_case field', () => {
    expect(getSpotImageUrl({ name: '清水寺', imageUrl: 'https://cdn.example/temple.jpg' })).toBe('https://cdn.example/temple.jpg');
    expect(getSpotImageUrl({ location_name: '清水寺', image_url: 'https://cdn.example/legacy.jpg' })).toBe('https://cdn.example/legacy.jpg');
  });

  it('builds a stable destination-aware image query when no image exists', () => {
    const url = getSpotImageUrl({ name: '東京鐵塔', address: '東京都港區', category: 'spot' });
    expect(url).toBe('https://loremflickr.com/300/300/japan,landmark');
    expect(url).not.toContain('source.unsplash.com');
  });

  it('maps common destination keywords to stable image tags', () => {
    expect(getSpotImageTags({ name: '關西國際機場', category: 'flight' })).toEqual(['airport']);
    expect(getSpotImageTags({ name: '黑門市場', category: 'spot' })).toEqual(['japan', 'food']);
    expect(getSpotImageTags({ name: '難波飯店', category: 'spot' })).toEqual(['hotel']);
  });

  it('returns a stable category fallback for unnamed spots', () => {
    expect(getSpotImageUrl({ category: 'food' })).toBe(SPOT_IMAGE_FALLBACKS.food);
    expect(getSpotImageFallback('hotel')).toBe(SPOT_IMAGE_FALLBACKS.hotel);
    expect(getSpotImageFallback('unknown-category')).toBe(SPOT_IMAGE_FALLBACKS.spot);
  });
});
