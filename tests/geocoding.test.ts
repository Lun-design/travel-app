import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOverpassQuery, createCachedGeocodingSearch, createDebouncedGeocodingSearch, getGeocodingAttribution, parseNominatimResults, parseOsmOpeningHours, parseOverpassResults } from '../lib/geocoding';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('parseNominatimResults', () => {
  it('maps Nominatim results to map choices', () => {
    expect(parseNominatimResults([{ place_id: 1, display_name: '台北 101, 信義區, 台北市', name: '台北 101', lat: '25.03', lon: '121.56' }]))
      .toEqual([{ id: '1', title: '台北 101', displayName: '台北 101, 信義區, 台北市', latitude: 25.03, longitude: 121.56 }]);
  });
  it('returns an empty list for no results', () => expect(parseNominatimResults([])).toEqual([]));

  it('maps an OSM opening_hours extra tag into weekly JSON data', () => {
    expect(parseNominatimResults([{ place_id: 2, display_name: 'Cafe', name: 'Cafe', lat: '25', lon: '121', extratags: { opening_hours: 'Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off' } }])[0].openingHours)
      .toEqual({
        monday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        tuesday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        wednesday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        thursday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        friday: { closed: false, periods: [{ open: '09:00', close: '18:00' }] },
        saturday: { closed: false, periods: [{ open: '10:00', close: '14:00' }] },
        sunday: { closed: true, periods: [] },
      });
  });

  it('supports always-open and overnight OSM values', () => {
    expect(parseOsmOpeningHours('24/7')?.monday).toEqual({ closed: false, periods: [{ open: '00:00', close: '00:00' }] });
    expect(parseOsmOpeningHours('Mo 18:00-02:00')?.monday).toEqual({ closed: false, periods: [{ open: '18:00', close: '02:00' }] });
  });

  it('keeps OSM identity metadata so a selected place can be queried again', () => {
    expect(parseNominatimResults([{ place_id: 3, osm_type: 'way', osm_id: 456, display_name: 'Museum', lat: '25', lon: '121' }])[0]).toMatchObject({ osmType: 'way', osmId: 456 });
  });

  it('parses opening_hours from an Overpass element', () => {
    expect(parseOverpassResults({ elements: [{ type: 'way', id: 456, tags: { opening_hours: 'Mo-Fr 09:00-18:00' } }] })?.monday).toEqual({ closed: false, periods: [{ open: '09:00', close: '18:00' }] });
  });

  it('builds an OSM-id query before using coordinate fallback', () => {
    expect(buildOverpassQuery({ latitude: 25.03, longitude: 121.56, osmType: 'way', osmId: 456 })).toContain('way(456)');
    expect(buildOverpassQuery({ latitude: 25.03, longitude: 121.56 })).toContain('around:80,25.03,121.56');
  });

  it('falls back from an OSM-id Overpass lookup to a nearby lookup', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [{ tags: { opening_hours: 'Mo-Fr 09:00-18:00' } }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchOverpassOpeningHours } = await import('../lib/geocoding');
    const result = await fetchOverpassOpeningHours({ latitude: 25.03123, longitude: 121.56123, osmType: 'way', osmId: 987654 });

    expect(result?.monday?.periods?.[0]).toEqual({ open: '09:00', close: '18:00' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('way(987654)');
    expect(String(fetchMock.mock.calls[1][0])).toContain('around%3A80%2C25.03123%2C121.56123');
  });

  it('waits 400ms and only searches the latest query', async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => []);
    const controller = createDebouncedGeocodingSearch(search, 400);

    controller.schedule('台北');
    controller.schedule('台北 101');
    await vi.advanceTimersByTimeAsync(399);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith('台北 101');
  });

  it('reuses cached results for normalized duplicate queries', async () => {
    const result = [{ id: '1', title: '台北 101', displayName: '台北 101', latitude: 25.03, longitude: 121.56 }];
    const source = vi.fn(async () => result);
    const search = createCachedGeocodingSearch(source);

    expect(await search('  台北   101 ')).toEqual(result);
    expect(await search('台北 101')).toEqual(result);
    expect(source).toHaveBeenCalledOnce();
  });
});

describe('geocoding attribution', () => {
  it('labels Google results as Google instead of OpenStreetMap', () => {
    expect(getGeocodingAttribution([{ id: 'google:1', provider: 'google', title: 'Cafe', displayName: 'Cafe', latitude: 25, longitude: 121 }])).toBe('Powered by Google');
    expect(getGeocodingAttribution([{ id: 'osm:1', title: 'Cafe', displayName: 'Cafe', latitude: 25, longitude: 121 }])).toBe('資料來源：OpenStreetMap contributors');
  });
});
