import { describe, expect, it } from 'vitest';
import { isPuppyId, PUPPY_IDS } from '../lib/puppy';

describe('puppy mascot assets', () => {
  it('registers all eleven configured GIF identifiers', () => {
    expect(PUPPY_IDS).toEqual(['-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11']);
  });

  it('rejects unknown mascot identifiers', () => {
    expect(isPuppyId('-1')).toBe(true);
    expect(isPuppyId('-11')).toBe(true);
    expect(isPuppyId('-12')).toBe(false);
  });
});
