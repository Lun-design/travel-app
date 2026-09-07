import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGooglePlaceDetails,
  parseGoogleOpeningHours,
  parseGooglePlaceDetails,
  pickPreferredPlaceAddress,
  resolveTripPlaceAddress,
  searchGooglePlaces,
} from '../lib/google-places';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseGoogleOpeningHours', () => {
  it('maps regularOpeningHours periods into weekly JSON with multiple periods', () => {
    expect(parseGoogleOpeningHours({
      periods: [
        { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } },
        { open: { day: 1, hour: 17, minute: 0 }, close: { day: 1, hour: 22, minute: 30 } },
        { open: { day: 2, hour: 10, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
      ],
    })).toEqual({
      sunday: { closed: true, periods: [] },
      monday: {
        closed: false,
        periods: [{ open: '09:00', close: '14:00' }, { open: '17:00', close: '22:30' }],
      },
      tuesday: { closed: false, periods: [{ open: '10:00', close: '18:00' }] },
      wednesday: { closed: true, periods: [] },
      thursday: { closed: true, periods: [] },
      friday: { closed: true, periods: [] },
      saturday: { closed: true, periods: [] },
    });
  });

  it('parses localized weekday descriptions when periods are unavailable', () => {
    expect(parseGoogleOpeningHours({
      weekdayDescriptions: [
        'Monday: 9:00 AM – 5:00 PM',
        'Tuesday: 9:00 AM – 5:00 PM',
        'Wednesday: Closed',
        'Thursday: 9:00 AM – 5:00 PM',
        'Friday: 9:00 AM – 5:00 PM',
        'Saturday: Open 24 hours',
        'Sunday: Closed',
      ],
    })?.saturday).toEqual({ closed: false, periods: [{ open: '00:00', close: '00:00' }] });
    expect(parseGoogleOpeningHours({
      weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'],
    })?.monday).toEqual({ closed: false, periods: [{ open: '09:00', close: '17:00' }] });
  });

  it('inherits the range meridiem when Google omits it on later intervals', () => {
    expect(parseGoogleOpeningHours({
      weekdayDescriptions: ['Thursday: 11:30 AM–2 PM, 2:30–4:30 PM, 5:30–9:30 PM'],
    })?.thursday).toEqual({
      closed: false,
      periods: [
        { open: '11:30', close: '14:00' },
        { open: '14:30', close: '16:30' },
        { open: '17:30', close: '21:30' },
      ],
    });
  });
});

describe('Google Places API mapping', () => {
  it('preserves a Chinese autocomplete address when details returns romaji', () => {
    expect(resolveTripPlaceAddress('清水寺, 日本、大阪府大阪市天王寺區 Reininchō, 3-28', '3-28 Reininchō, Tennoji Ward, Osaka, 543-0061 Japan')).toBe('清水寺, 日本、大阪府大阪市天王寺區 Reininchō, 3-28');
  });

  it('requests Place Details in Traditional Chinese and prefers a localized fallback address', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ChIJdetails',
        displayName: { text: 'Universal Studios Japan' },
        formattedAddress: '2-1-33 Sakurajima, Konohana Ward, Osaka',
        location: { latitude: 34.6654, longitude: 135.4323 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const details = await fetchGooglePlaceDetails('ChIJdetails', 'test-key');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/ChIJdetails?languageCode=zh-TW',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Goog-Api-Key': 'test-key' }) }),
    );
    expect(pickPreferredPlaceAddress(details.displayName, '大阪市此花區櫻島 2-1-33')).toBe('大阪市此花區櫻島 2-1-33');
  });

  it('maps Place Details location and opening hours to a GeocodingResult', () => {
    expect(parseGooglePlaceDetails({
      id: 'ChIJplace',
      displayName: { text: 'Example Restaurant' },
      formattedAddress: 'Taipei, Taiwan',
      location: { latitude: 25.03, longitude: 121.56 },
      regularOpeningHours: {
        weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'],
      },
    })).toMatchObject({
      id: 'google:ChIJplace',
      googlePlaceId: 'ChIJplace',
      provider: 'google',
      title: 'Example Restaurant',
      displayName: 'Taipei, Taiwan',
      latitude: 25.03,
      longitude: 121.56,
      openingHours: {
        monday: { closed: false, periods: [{ open: '09:00', close: '17:00' }] },
      },
    });
  });

  it('posts Autocomplete (New) input and maps place predictions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [{
          placePrediction: {
            placeId: 'ChIJ123',
            text: { text: '饗食天堂 台北店' },
            structuredFormat: {
              mainText: { text: '饗食天堂' },
              secondaryText: { text: '台北市' },
            },
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchGooglePlaces('饗食天堂', 'test-key');

    expect(results[0]).toMatchObject({
      id: 'google:ChIJ123',
      googlePlaceId: 'ChIJ123',
      provider: 'google',
      title: '饗食天堂',
      displayName: '饗食天堂, 台北市',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('饗食天堂') }),
    );
  });
});
describe('Google Places search fallback', () => {
  it('falls back to global Text Search when Autocomplete has no Chinese result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ suggestions: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{
            id: 'places/ChIJusjapan',
            displayName: { text: 'Universal Studios Japan' },
            formattedAddress: '大阪府大阪市此花區櫻島 2-1-33',
            location: { latitude: 34.6654, longitude: 135.4323 },
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchGooglePlaces('日本大阪環球', 'test-key');

    expect(results).toMatchObject([{
      id: 'google:ChIJusjapan',
      googlePlaceId: 'ChIJusjapan',
      title: 'Universal Studios Japan',
      displayName: '大阪府大阪市此花區櫻島 2-1-33',
      latitude: 34.6654,
      longitude: 135.4323,
    }]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({ textQuery: '日本大阪環球', languageCode: 'zh-TW' });
  });
});
