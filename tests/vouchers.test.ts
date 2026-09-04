import { describe, expect, it } from 'vitest';
import { normalizeVoucherFileType } from '../lib/vouchers';

describe('voucher helpers', () => {
  it('normalizes supported MIME types to image or pdf', () => {
    expect(normalizeVoucherFileType('application/pdf')).toBe('pdf');
    expect(normalizeVoucherFileType('image/jpeg')).toBe('image');
    expect(normalizeVoucherFileType('image/png')).toBe('image');
    expect(normalizeVoucherFileType('text/plain')).toBeNull();
  });
});
