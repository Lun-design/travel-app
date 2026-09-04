import { describe, expect, it } from 'vitest';
import { generatePackingSuggestions, isPackingComplete, packingProgress } from '../lib/packing-utils';

describe('packing suggestions', () => {
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
    expect(names).toContain('雨具');
    expect(new Set(names).size).toBe(names.length);
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
