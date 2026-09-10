import { describe, expect, it } from 'vitest';
import { formatPlaceAddress } from '../lib/place-actions';

describe('place actions', () => {
  it('normalizes an address for copying', () => {
    expect(formatPlaceAddress('  台北車站  ')).toBe('台北車站');
    expect(formatPlaceAddress('')).toBeNull();
    expect(formatPlaceAddress(undefined)).toBeNull();
  });
});
