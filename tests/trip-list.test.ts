import { describe, expect, it } from 'vitest';
import { tripListState } from '../lib/trip-list';

describe('tripListState', () => {
  it('treats an empty response as an empty state', () => expect(tripListState([])).toEqual({ kind: 'empty' }));
  it('keeps real errors as errors', () => expect(tripListState(null, 'network')).toEqual({ kind: 'error', message: 'network' }));
});
