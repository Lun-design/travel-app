import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseGoogleOpeningHours,
  parseGooglePlaceDetails,
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
});

describe('Google Places API mapping', () => {
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
