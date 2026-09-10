import { describe, expect, it } from 'vitest';
import { formatPlaceAddress, formatPlaceCoordinates, buildPlaceShareText } from '../lib/place-actions';

describe('place actions', () => {
  it('normalizes address and coordinates for copying', () => {
    expect(formatPlaceAddress('  台北車站  ')).toBe('台北車站');
    expect(formatPlaceAddress('')).toBeNull();
    expect(formatPlaceCoordinates(25.0478, 121.517)).toBe('25.047800, 121.517000');
    expect(formatPlaceCoordinates(null, 121.517)).toBeNull();
  });

  it('builds a compact shareable place message', () => {
    expect(buildPlaceShareText({ title: '台北車站', address: '台北市北平西路', latitude: 25.0478, longitude: 121.517 }))
      .toBe('台北車站\n地址：台北市北平西路\n座標：25.047800, 121.517000');
    expect(buildPlaceShareText({ title: '無座標景點', address: null, latitude: null, longitude: null }))
      .toBe('無座標景點');
  });
});
