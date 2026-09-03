import { describe, expect, it } from 'vitest';
import { mapFallbackMessage } from '../lib/map-platform';

describe('map platform fallback', () => {
  it('provides a useful message for web maps', () => {
    expect(mapFallbackMessage()).toContain('手機版');
  });
});
