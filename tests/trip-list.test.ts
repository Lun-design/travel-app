import { describe, expect, it } from 'vitest';
import { tripListState, tripManagementAction } from '../lib/trip-list';

describe('tripListState', () => {
  it('treats an empty response as an empty state', () => expect(tripListState([])).toEqual({ kind: 'empty' }));
  it('keeps real errors as errors', () => expect(tripListState(null, 'network')).toEqual({ kind: 'error', message: 'network' }));
});

describe('tripManagementAction', () => {
  it('gives owners delete actions and other members leave actions', () => {
    expect(tripManagementAction('owner')).toBe('delete');
    expect(tripManagementAction('editor')).toBe('leave');
    expect(tripManagementAction('viewer')).toBe('leave');
    expect(tripManagementAction(undefined)).toBeNull();
  });
});
