import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchGooglePlacesTextPage } from '../lib/google-places';
import {
  createRecommendationSessionCache,
  mergeRecommendationResults,
  searchDynamicRecommendationsPage,
} from '../lib/global-recommendations';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recommendation pagination', () => {
  it('passes Google Places nextPageToken through to the next request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{
            id: 'places/one',
            displayName: { text: 'Place One' },
            formattedAddress: 'Osaka, Japan',
            location: { latitude: 34.7, longitude: 135.5 },
          }],
          nextPageToken: 'page-2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          places: [{
            id: 'places/two',
            displayName: { text: 'Place Two' },
            formattedAddress: 'Osaka, Japan',
            location: { latitude: 34.71, longitude: 135.51 },
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const first = await searchGooglePlacesTextPage('大阪 燒肉', 'test-key');
    const second = await searchGooglePlacesTextPage('大阪 燒肉', 'test-key', first.nextPageToken ?? undefined);

    expect(first.nextPageToken).toBe('page-2');
    expect(second.results[0]).toMatchObject({ id: 'google:two', title: 'Place Two' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      textQuery: '大阪 燒肉',
      languageCode: 'zh-TW',
      pageToken: 'page-2',
    });
  });

  it('loads recommendation pages and appends the next token batch', async () => {
    const calls: Array<string | undefined> = [];
    const provider = async (query: string, pageToken?: string) => {
      calls.push(pageToken);
      return {
        results: [{
          id: pageToken ? 'place-2' : 'place-1',
          title: pageToken ? 'Place Two' : 'Place One',
          displayName: `${query}, Osaka, Japan`,
          latitude: 34.7,
          longitude: 135.5,
        }],
        nextPageToken: pageToken ? null : 'page-2',
      };
    };

    const first = await searchDynamicRecommendationsPage('大阪', 'food', { provider, subcategory: 'bbq' });
    const second = await searchDynamicRecommendationsPage('大阪', 'food', {
      provider,
      subcategory: 'bbq',
      pageToken: first.nextPageToken,
    });

    expect(calls).toEqual([undefined, 'page-2']);
    expect(first.results[0]).toMatchObject({ id: 'place-1', title: 'Place One' });
    expect(second.results[0]).toMatchObject({ id: 'place-2', title: 'Place Two' });
    expect(second.nextPageToken).toBeNull();
  });

  it('reuses an in-flight session page and removes duplicates when merging', async () => {
    const cache = createRecommendationSessionCache();
    let calls = 0;
    const fetchPage = async () => {
      calls += 1;
      return { results: ['one'], nextPageToken: null };
    };

    const [first, second] = await Promise.all([
      cache.getOrFetch('osaka|food|all|', fetchPage),
      cache.getOrFetch('osaka|food|all|', fetchPage),
    ]);

    expect(calls).toBe(1);
    expect(first).toEqual(second);
    expect(mergeRecommendationResults([{ id: 'one' }, { id: 'two' }], [{ id: 'two' }, { id: 'three' }])).toEqual([
      { id: 'one' },
      { id: 'two' },
      { id: 'three' },
    ]);
  });
});
