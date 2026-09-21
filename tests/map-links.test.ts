import { describe, expect, it } from 'vitest';
import { getGoogleMapsNavigationUrl } from '../lib/map-links';

describe('Google Maps card navigation URL', () => {
  it('uses a destination-only Directions URL for a Place ID', () => {
    const url = getGoogleMapsNavigationUrl({
      place_id: 'ChIJ-place-123',
      latitude: 25.01,
      longitude: 121.46,
      address: '台北市信義區',
      title: '自訂 Airbnb',
      mode: 'DRIVING',
    });

    expect(url).toContain('https://www.google.com/maps/dir/?api=1');
    expect(url).toContain('destination=Google');
    expect(url).toContain('destination_place_id=ChIJ-place-123');
    expect(url).toContain('travelmode=driving');
    expect(url).toContain('dirflg=d');
    expect(url).not.toContain('origin=');
  });

  it('uses the precise address as the destination before coordinates', () => {
    const url = getGoogleMapsNavigationUrl({
      latitude: 25.0109,
      longitude: 121.464,
      address: '大阪府大阪市浪速区大國町 1-2-3',
      title: '大國町 Airbnb',
      mode: 'WALKING',
    });

    expect(url).toContain(`destination=${encodeURIComponent('大阪府大阪市浪速区大國町 1-2-3')}`);
    expect(url).toContain('travelmode=walking');
    expect(url).toContain('dirflg=w');
    expect(url).not.toContain('origin=');
    expect(url).not.toContain('25.0109%2C121.464');
  });

  it('falls back to the title as a destination when no address exists', () => {
    const url = getGoogleMapsNavigationUrl({
      latitude: null,
      longitude: null,
      address: null,
      title: '關西國際機場 第一航廈',
      mode: 'TRANSIT',
    });

    expect(url).toContain(`destination=${encodeURIComponent('關西國際機場 第一航廈')}`);
    expect(url).toContain('travelmode=transit');
    expect(url).toContain('dirflg=r');
    expect(url).not.toContain('origin=');
  });

  it('uses coordinates only as the last destination fallback', () => {
    const url = getGoogleMapsNavigationUrl({
      latitude: 25.0109,
      longitude: 121.464,
      address: null,
      title: null,
    });

    expect(url).toContain('destination=25.0109%2C121.464');
    expect(url).toContain('travelmode=driving');
    expect(url).not.toContain('origin=');
  });
});
