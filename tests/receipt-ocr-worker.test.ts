import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recognizeReceiptWithTesseract } from '../lib/receipt-ocr';
import { createWorker } from 'tesseract.js';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

describe('receipt OCR worker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initializes exactly four non-empty language codes before recognition', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: '總計 12200' } });
    const terminate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createWorker).mockResolvedValue({ recognize, terminate } as never);

    const result = await recognizeReceiptWithTesseract(new Blob(['receipt']));

    expect(createWorker).toHaveBeenCalledWith('chi_tra+eng+jpn+kor');
    expect(result.amount).toBe(12200);
    expect(recognize).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
