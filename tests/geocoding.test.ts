import { describe, expect, it } from 'vitest';
import { parseNominatimResults } from '../lib/geocoding';

describe('parseNominatimResults', () => {
  it('maps Nominatim results to map choices', () => {
    expect(parseNominatimResults([{ place_id: 1, display_name: 'Taipei', lat: '25.03', lon: '121.56' }]))
      .toEqual([{ id: '1', displayName: 'Taipei', latitude: 25.03, longitude: 121.56 }]);
  });
  it('returns an empty list for no results', () => expect(parseNominatimResults([])).toEqual([]));
});
