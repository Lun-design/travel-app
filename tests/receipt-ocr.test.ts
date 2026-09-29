import { describe, expect, it } from 'vitest';
import { parseReceiptText } from '../lib/receipt-ocr';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('receipt OCR parsing', () => {
  it('extracts a title, total amount and currency from OCR text', () => {
    expect(parseReceiptText('大阪食堂\n合計 ¥1,280\n2026/09/24')).toMatchObject({
      title: '大阪食堂',
      amount: 1280,
      currency: 'JPY',
      usageDate: '2026-09-24',
    });
  });

  it('returns a safe partial result when amount is not found', () => {
    expect(parseReceiptText('Cafe receipt')).toMatchObject({ title: 'Cafe receipt', amount: null });
  });

  it('parses Japanese and Korean total keywords', () => {
    expect(parseReceiptText('大阪店\n小計 ¥1,280\n')).toMatchObject({ amount: 1280, currency: 'JPY' });
    expect(parseReceiptText('서울 식당\n결제금액 ₩18,000\n')).toMatchObject({ amount: 18000, currency: 'KRW' });
  });

  it('falls back to the largest receipt number while ignoring dates and quantities', () => {
    expect(parseReceiptText('2026/09/24\n商品 2 個 120\n商品 1 個 980\n')).toMatchObject({ amount: 980 });
  });

  it('wires a mobile receipt scan action into the expense modal', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    const scanner = readFileSync(path.resolve(process.cwd(), 'src/components/ReceiptScanButton.tsx'), 'utf8');
    expect(source).toContain('ReceiptScanButton');
    expect(source).toContain('applyReceiptScan');
    expect(source).toContain('<ReceiptScanButton onResult={applyReceiptScan} />');
    expect(source).not.toContain('expense ? null : <ReceiptScanButton');
    expect(scanner).toContain('launchCameraAsync');
    expect(scanner).toContain('recognizeReceiptWithTesseract');
    const ocr = readFileSync(path.resolve(process.cwd(), 'lib/receipt-ocr.ts'), 'utf8');
    expect(ocr).toContain("createWorker(['chi_tra', 'eng', 'jpn', 'kor'])");
    expect(ocr).toContain("[OCR] Raw parsed text:");
    expect(ocr).toContain('preprocessReceiptImage');
  });
});
