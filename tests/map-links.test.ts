import { describe, expect, it } from 'vitest';
import { getGoogleMapsNavigationUrl } from '../lib/map-links';

describe('Google Maps navigation URL priority', () => {
  it('uses a Google Place ID before coordinates, address, or title', () => {
    expect(getGoogleMapsNavigationUrl({
      place_id: 'ChIJ-place-123',
      latitude: 25.01,
      longitude: 121.46,
      address: '台北市某處',
      title: '自訂住宿名稱',
    })).toBe('https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJ-place-123');
  });

  it('uses valid coordinates before an imprecise custom title', () => {
    expect(getGoogleMapsNavigationUrl({
      latitude: 25.0109,
      longitude: 121.464,
      address: '新北市新莊區',
      title: '大國町 Airbnb',
    })).toBe('https://www.google.com/maps/search/?api=1&query=25.0109%2C121.464');
  });

  it('falls back to the exact address before the title', () => {
    expect(getGoogleMapsNavigationUrl({
      latitude: null,
      longitude: null,
      address: '大阪府大阪市浪速區大國町 1-2-3',
      title: '大國町 Airbnb',
    })).toBe('https://www.google.com/maps/search/?api=1&query=%E5%A4%A7%E9%98%AA%E5%BA%9C%E5%A4%A7%E9%98%AA%E5%B8%82%E6%B5%AA%E9%80%9F%E5%8D%80%E5%A4%A7%E5%9C%8B%E7%94%BA%201-2-3');
  });

  it('uses the title only when no precise location data exists', () => {
    expect(getGoogleMapsNavigationUrl({
      latitude: Number.NaN,
      longitude: Number.NaN,
      address: null,
      title: '大國町 Airbnb',
    })).toBe('https://www.google.com/maps/search/?api=1&query=%E5%A4%A7%E5%9C%8B%E7%94%BA%20Airbnb');
  });
});
