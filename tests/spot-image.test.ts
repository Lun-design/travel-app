import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXACT_SPOT_MAP,
  getGooglePhotoUrl,
  getSpotImageFallback,
  getSpotImageTags,
  getSpotImageUrl,
  SPOT_IMAGE_FALLBACKS,
} from '../lib/spot-image';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('spot image resolver', () => {
  it('prefers an explicitly supplied image URL, including the API snake_case field', () => {
    expect(getSpotImageUrl({ name: '清水寺', imageUrl: 'https://cdn.example/temple.jpg' })).toBe('https://cdn.example/temple.jpg');
    expect(getSpotImageUrl({ location_name: '清水寺', image_url: 'https://cdn.example/legacy.jpg' })).toBe('https://cdn.example/legacy.jpg');
  });

  it('uses the Google Places Photo endpoint with the public key and a 300px width', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    expect(getGooglePhotoUrl('photo-ref')).toBe(
      'https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&photo_reference=photo-ref&key=test-key',
    );
    expect(getSpotImageUrl({ name: '東京鐵塔', photoReference: 'photo-ref' })).toBe(
      'https://maps.googleapis.com/maps/api/place/photo?maxwidth=300&photo_reference=photo-ref&key=test-key',
    );
  });

  it('falls back to a curated exact spot image before category defaults', () => {
    expect(getSpotImageUrl({ name: '關西國際機場', category: 'flight' })).toBe(EXACT_SPOT_MAP['關西國際機場']);
    expect(getSpotImageUrl({ name: '黑門市場', category: 'spot' })).toBe(EXACT_SPOT_MAP['黑門市場']);
  });

  it('uses a category image for unknown spots and never calls a random image API', () => {
    const url = getSpotImageUrl({ name: '一個不存在的景點', category: 'food' });
    expect(url).toBe(SPOT_IMAGE_FALLBACKS.food);
    expect(url).not.toContain('loremflickr.com');
    expect(url).not.toContain('source.unsplash.com');
  });

  it('ignores a photo reference when the public key is unavailable', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '');
    expect(getGooglePhotoUrl('photo-ref')).toBeNull();
    expect(getSpotImageUrl({ name: '未知景點', photoReference: 'photo-ref', category: 'hotel' })).toBe(
      SPOT_IMAGE_FALLBACKS.hotel,
    );
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
