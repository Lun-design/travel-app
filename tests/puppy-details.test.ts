import { describe, expect, it } from 'vitest';
import { getPackingPawProgress, shouldSuggestRestBreak } from '../lib/puppy-details';

describe('small puppy travel details', () => {
  it('fills progress paws proportionally while keeping empty lists empty', () => {
    expect(getPackingPawProgress(3, 5)).toEqual({ filled: 5, total: 8 });
    expect(getPackingPawProgress(8, 5)).toEqual({ filled: 8, total: 8 });
    expect(getPackingPawProgress(0, 0)).toEqual({ filled: 0, total: 8 });
  });

  it('suggests a short rest after a long journey leg, not for short or unknown legs', () => {
    expect(shouldSuggestRestBreak(120)).toBe(true);
    expect(shouldSuggestRestBreak(119)).toBe(false);
    expect(shouldSuggestRestBreak(null)).toBe(false);
  });
});
