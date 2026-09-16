import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXACT_SPOT_MAP,
  getGooglePhotoUrl,
  getSpotImageFallbackUrl,
  getSpotImageFallback,
  getSpotImageLightboxUrl,
  searchSpotImage,
  getSpotImageTags,
  getSpotImageUrl,
  resolveSpotImage,
  SPOT_IMAGE_FALLBACK_VARIANTS,
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

  it('uses the Google Places Photo endpoint with the public key and a 400px width', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    expect(getGooglePhotoUrl('photo-ref')).toBe(
      'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=photo-ref&key=test-key',
    );
    expect(getSpotImageUrl({ name: '東京鐵塔', photoReference: 'photo-ref' })).toBe(
      'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=photo-ref&key=test-key',
    );
  });

  it('uses the Places API (New) media endpoint for photo resource names', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    expect(getGooglePhotoUrl('places/ChIJphoto/photos/photo-reference-123')).toBe(
      'https://places.googleapis.com/v1/places/ChIJphoto/photos/photo-reference-123/media?maxWidthPx=400&key=test-key',
    );
  });

  it('uses a larger Google photo URL for the lightbox preview', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    expect(getSpotImageLightboxUrl({ photoReference: 'photo-ref' })).toBe(
      'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=photo-ref&key=test-key',
    );
  });

  it('searches a replacement photo and returns its Google media URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          id: 'places/ChIJreplacement',
          displayName: { text: '戎橋' },
          formattedAddress: '大阪府大阪市',
          location: { latitude: 34.67, longitude: 135.5 },
          photos: [{ name: 'places/ChIJreplacement/photos/panorama', types: ['landmark'], widthPx: 1600, heightPx: 900 }],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchSpotImage('戎橋拍攝固力果招牌')).resolves.toMatchObject({
      photoReference: 'places/ChIJreplacement/photos/panorama',
      url: 'https://places.googleapis.com/v1/places/ChIJreplacement/photos/panorama/media?maxWidthPx=400&key=test-key',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).textQuery).toBe('戎橋');
  });

  it('upscales curated static images for the lightbox preview', () => {
    const preview = getSpotImageLightboxUrl({ name: 'Unknown spot', category: 'spot' });
    expect(preview).toContain('images.unsplash.com');
    expect(preview).toContain('w=1200');
    expect(preview).toContain('h=1200');
  });

  it('rejects invalid photo references before constructing a request URL', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    for (const reference of [null, undefined, { name: 'photo' }, '[object Object]', 'null', 'undefined', 'places/invalid']) {
      expect(getGooglePhotoUrl(reference)).toBeNull();
    }
    expect(getSpotImageUrl({ name: 'Unknown place', photoReference: '[object Object]', category: 'spot' })).not.toContain('googleapis.com');
  });

  it('falls back to a curated exact spot image before category defaults', () => {
    expect(getSpotImageUrl({ name: '關西國際機場', category: 'flight' })).toBe(EXACT_SPOT_MAP['關西國際機場']);
    expect(getSpotImageUrl({ name: '黑門市場', category: 'spot' })).toBe(EXACT_SPOT_MAP['黑門市場']);
  });

  it('matches destination aliases embedded in a longer spot name', () => {
    expect(getSpotImageUrl({ name: '黑門市場早午餐' })).toBe(EXACT_SPOT_MAP['黑門市場']);
    expect(getSpotImageUrl({ name: '固力果跑者招牌與戎橋夜景' })).toBe(EXACT_SPOT_MAP['道頓堀']);
    expect(getSpotImageUrl({ name: 'LUCUA Osaka 與 Grand Front' })).toBe(EXACT_SPOT_MAP['梅田']);
    expect(getSpotImageUrl({ name: '飯店辦理入住' })).toBe(EXACT_SPOT_MAP['飯店']);
    expect(getSpotImageUrl({ name: '咖啡廳休息' })).toBe(EXACT_SPOT_MAP['咖啡廳']);
  });

  it('uses a category image for unknown spots and never calls a random image API', () => {
    const url = getSpotImageUrl({ name: '一個不存在的景點', category: 'food' });
    expect(SPOT_IMAGE_FALLBACK_VARIANTS.food).toContain(url);
    expect(url).not.toContain('loremflickr.com');
    expect(url).not.toContain('source.unsplash.com');
  });

  it('keeps curated map URLs on the stable Unsplash CDN', () => {
    for (const url of Object.values(EXACT_SPOT_MAP)) {
      expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
      expect(url).not.toContain('source.unsplash.com');
      expect(url).not.toContain('loremflickr.com');
    }
  });

  it('uses a stable name/id hash to spread unknown spots across category images', () => {
    const first = getSpotImageUrl({ id: 'spot-a', name: '未命名景點 A', category: 'spot' });
    const second = getSpotImageUrl({ id: 'spot-b', name: '未命名景點 B', category: 'spot' });
    expect(first).not.toBe(second);
    expect(getSpotImageUrl({ id: 'spot-a', name: '未命名景點 A', category: 'spot' })).toBe(first);
  });

  it('ignores a photo reference when the public key is unavailable', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '');
    expect(getGooglePhotoUrl('photo-ref')).toBeNull();
    expect(SPOT_IMAGE_FALLBACK_VARIANTS.hotel).toContain(
      getSpotImageUrl({ name: '未知景點', photoReference: 'photo-ref', category: 'hotel' }),
    );
  });

  it('dynamically resolves a missing photo reference from Places Text Search', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [{
          id: 'places/ChIJdynamic',
          displayName: { text: '自訂景點' },
          formattedAddress: '大阪府大阪市',
          location: { latitude: 34.7, longitude: 135.5 },
          photos: [{ name: 'places/ChIJdynamic/photos/dynamic-photo-ref' }],
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveSpotImage({ name: '自訂景點', address: '大阪府大阪市', category: 'spot' });

    expect(resolved).toMatchObject({
      photoReference: 'places/ChIJdynamic/photos/dynamic-photo-ref',
      url: 'https://places.googleapis.com/v1/places/ChIJdynamic/photos/dynamic-photo-ref/media?maxWidthPx=400&key=test-key',
    });
    await resolveSpotImage({ name: '自訂景點', address: '大阪府大阪市', category: 'spot' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back without throwing when Places Photo lookup is rejected', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveSpotImage({ name: 'Unknown hotel', address: 'Osaka hotel address', category: 'hotel' });

    expect(SPOT_IMAGE_FALLBACK_VARIANTS.hotel).toContain(resolved.url);
    expect(resolved.photoReference).toBeNull();
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

  it('returns a stable non-failed image when a remote photo fails to load', () => {
    const failedGoogleUrl = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=bad&key=test-key';
    const fallback = getSpotImageFallbackUrl({ name: 'Kuromon Market', category: 'food' }, failedGoogleUrl);
    expect(fallback).toBe(EXACT_SPOT_MAP['kuromon market']);
    expect(fallback).not.toBe(failedGoogleUrl);
    expect(fallback).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it('skips a failed curated image and selects a different deterministic category variant', () => {
    const spot = { id: 'unknown-spot', name: 'Unknown place', category: 'food' } as const;
    const first = getSpotImageUrl(spot);
    const fallback = getSpotImageFallbackUrl(spot, first);
    expect(SPOT_IMAGE_FALLBACK_VARIANTS.food).toContain(fallback);
    expect(fallback).not.toBe(first);
  });
});
