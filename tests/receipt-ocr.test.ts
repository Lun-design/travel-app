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

  it('wires a mobile receipt scan action into the expense modal', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    const scanner = readFileSync(path.resolve(process.cwd(), 'src/components/ReceiptScanButton.tsx'), 'utf8');
    expect(source).toContain('ReceiptScanButton');
    expect(source).toContain('applyReceiptScan');
    expect(scanner).toContain('launchCameraAsync');
    expect(scanner).toContain('recognizeReceiptWithTesseract');
  });
});
