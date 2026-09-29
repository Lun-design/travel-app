import { describe, expect, it } from 'vitest';
import { parseReceiptText, sumReceiptItems } from '../lib/receipt-ocr';
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
    expect(parseReceiptText('Cafe receipt')).toMatchObject({ title: '收據消費', amount: null, items: [] });
  });

  it('extracts six Taiwan invoice line items, merchant, discount, and final total', () => {
    const result = parseReceiptText(`退貨需憑證明細
原價屋電腦(股)公司光華分公司
電話:(02)2397-2669
2022-02-12 16:13:08
商品名稱 數量 單價 金額
利民 Silver Soul 135 散熱器
1 1590 1590TX
利民 TL-C12 PRO-G 12cm 風扇 1 550 550TX
F.D Torrent Nano RGB 黑色機殼 1 4690 4690TX
ASUS ROG Strix Scope RX PBT 機械鍵盤 1 3490 3490TX
ASUS ROG Pugio II 滑鼠 1 2490 2490TX
酷幣優惠折扣 -1 610 -610TX
合計: 11619
稅額: 581
總計: 12200`);
    expect(result).toMatchObject({ title: '原價屋', amount: 12200, currency: 'TWD' });
    expect(result.items).toHaveLength(6);
    expect(result.items.map((item) => item.price)).toEqual([1590, 550, 4690, 3490, 2490, -610]);
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[5].name).toBe('酷幣優惠折扣');
    expect(sumReceiptItems(result.items)).toBe(12200);
  });

  it('uses the first real item when merchant is absent, and rejects noisy headings', () => {
    expect(parseReceiptText('TAX INVOICE\n商品名稱 數量 金額\n黑門市場便當 1 850円\n合計 850円')).toMatchObject({ title: '黑門市場便當', amount: 850 });
    expect(parseReceiptText('RECEIPT\n*** /// !!!\nTEL 12345678')).toMatchObject({ title: '收據消費' });
  });

  it('parses English line-item headers and negative discounts', () => {
    const result = parseReceiptText('Tokyo Store\nITEM QTY PRICE\nNotebook 2 300\nCoupon -100\nTOTAL 500');
    expect(result.items).toEqual([{ name: 'Notebook', quantity: 2, price: 300 }, { name: 'Coupon', price: -100 }]);
  });

  it('removes NT$ and tax suffixes from item prices', () => {
    const result = parseReceiptText('光華商店\n商品名稱 數量 金額\n散熱器 1 NT$1,590TX\n總計 NT$1,590');
    expect(result.items).toEqual([{ name: '散熱器', quantity: 1, price: 1590 }]);
    expect(result.amount).toBe(1590);
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

  it('provides editable receipt rows and a live total comparison in the expense modal', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    expect(source).toContain('setReceiptItems(result.items)');
    expect(source).toContain('sumReceiptItems(receiptItems)');
    expect(source).toContain('商品明細');
    expect(source).toContain('新增明細');
    expect(source).toContain('刪除');
    expect(source).toContain('明細加總');
  });

  it('persists scanned line items only when supplied by the expense editor', () => {
    const api = readFileSync(path.resolve(process.cwd(), 'lib/expenses-api.ts'), 'utf8');
    expect(api).toContain('receipt_items: expense.receipt_items');
    const migration = readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260929000000_expense_receipt_items.sql'), 'utf8');
    expect(migration).toContain('add column if not exists receipt_items jsonb');
  });
});
