import { describe, expect, it } from 'vitest';
import { buildTripPayload, validateTripCreator } from '../lib/trip-validation';

describe('validateTripCreator', () => {
  it('accepts the current auth user', () => expect(validateTripCreator('user-1', 'user-1')).toBe(true));
  it('rejects a mismatched creator', () => expect(() => validateTripCreator('user-1', 'user-2')).toThrow('created_by 必須與目前登入使用者一致'));
  it('always builds the payload with the session user', () => expect(buildTripPayload({ title: 'Trip', created_by: 'spoofed' }, 'user-1').created_by).toBe('user-1'));
});
