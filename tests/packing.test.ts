import { describe, expect, it } from 'vitest';
import { dedupePackingItems, generatePackingSuggestions, hasRainyForecast, isPackingComplete, packingProgress, RAIN_GEAR_NAME } from '../lib/packing-utils';

describe('packing suggestions', () => {
  it('deduplicates by normalized item name and category', () => {
    const existing = [{ id: 'existing', name: 'Power bank', category: 'Electronics' }];
    const incoming = [
      { name: ' power bank ', category: 'Electronics' },
      { name: 'Power bank', category: 'Travel' },
      { name: 'Charging cable', category: 'Electronics' },
      { name: 'CHARGING CABLE', category: 'electronics' },
    ];

    expect(dedupePackingItems(incoming, existing)).toEqual([
      { name: 'Power bank', category: 'Travel' },
      { name: 'Charging cable', category: 'Electronics' },
    ]);
  });

  it('adds destination and weather-aware essentials without duplicates', () => {
    const suggestions = generatePackingSuggestions('北海道滑雪', {
      precipitationProbability: 72,
      temperatureMinC: -4,
      temperatureMaxC: 5,
    });
    const names = suggestions.map((item) => item.name);

    expect(names).toContain('護照／身分證');
    expect(names).toContain('保暖外套');
    expect(names).toContain('滑雪手套');
    expect(names).toContain(RAIN_GEAR_NAME);
    expect(new Set(names).size).toBe(names.length);
  });

  it('detects rain gear from any forecast day at the configured threshold', () => {
    expect(hasRainyForecast([
      { precipitationProbability: 12 },
      { precipitationProbability: 50 },
    ])).toBe(true);
    expect(hasRainyForecast([
      { precipitationProbability: 49 },
      { precipitationProbability: null },
    ])).toBe(false);
  });

  it('adds rain gear when a later forecast day reaches 50 percent', () => {
    const suggestions = generatePackingSuggestions('東京', {
      precipitationProbability: 0,
      temperatureMinC: 20,
      temperatureMaxC: 25,
      forecast: [
        { precipitationProbability: 10 },
        { precipitationProbability: 50 },
      ],
    });
    expect(suggestions.map((item) => item.name)).toContain(RAIN_GEAR_NAME);
  });

  it('adds beach and hot-weather items for a sunny island trip', () => {
    const suggestions = generatePackingSuggestions('沖繩海島', {
      precipitationProbability: 10,
      temperatureMinC: 25,
      temperatureMaxC: 31,
    });
    const names = suggestions.map((item) => item.name);

    expect(names).toContain('泳衣');
    expect(names).toContain('防曬乳');
    expect(names).toContain('遮陽帽');
  });

  it('calculates progress from the new is_packed field as well', () => {
    expect(packingProgress([{ category: '衣物', is_packed: true }, { category: '藥品', is_packed: false }])).toEqual({
      total: 2,
      completed: 1,
      percentage: 50,
    });
  });

  it('only marks a non-empty list complete when every item is packed', () => {
    expect(isPackingComplete([])).toBe(false);
    expect(isPackingComplete([{ category: '衣物', is_checked: true }])).toBe(true);
    expect(isPackingComplete([
      { category: '衣物', is_checked: true },
      { category: '藥品', is_packed: false },
    ])).toBe(false);
  });
});
