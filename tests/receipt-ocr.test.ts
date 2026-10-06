import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReceiptScanNotice, parseReceiptText, preprocessReceiptImage, sumReceiptItems } from '../lib/receipt-ocr';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('receipt OCR parsing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('upscales a narrow receipt to 1500px and sends black-and-white pixels to OCR', async () => {
    const pixels = { data: new Uint8ClampedArray([128, 128, 128, 255, 220, 220, 220, 255]) };
    const putImageData = vi.fn();
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: vi.fn(), getImageData: () => pixels, putImageData }),
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['processed'], { type: 'image/png' })),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('Image', class {
      naturalWidth = 600;
      naturalHeight = 300;
      onload?: () => void;
      set src(_value: string) { this.onload?.(); }
    });

    const result = await preprocessReceiptImage('blob:receipt');
    expect(canvas).toMatchObject({ width: 1500, height: 750 });
    expect([...pixels.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(putImageData).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Blob);
  });

  it('shows a brief amount-only notice when OCR has no reliable line items', () => {
    const result = { title: '購物消費', amount: 12200, currency: 'TWD' as const, usageDate: null, items: [] };
    expect(getReceiptScanNotice(result)).toBe('已自動帶入總金額 $12,200，明細請手動補充。');
    expect(getReceiptScanNotice({ ...result, items: [{ name: '商品', price: 12200 }] })).toBeNull();
    expect(getReceiptScanNotice({ ...result, amount: null })).toBeNull();
    const modal = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    expect(modal).not.toContain('getReceiptScanNotice');
    expect(modal).not.toContain('掃描收據');
  });
  it('extracts a title, total amount and currency from OCR text', () => {
    expect(parseReceiptText('大阪食堂\n合計 ¥1,280\n2026/09/24')).toMatchObject({
      title: '大阪食堂',
      amount: 1280,
      currency: 'JPY',
      usageDate: '2026-09-24',
    });
  });

  it('returns a safe partial result when amount is not found', () => {
    expect(parseReceiptText('Cafe receipt')).toMatchObject({ title: 'Shopping', amount: null, items: [] });
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
    expect(result).toMatchObject({ title: '原價屋電腦', amount: 12200, currency: 'TWD' });
    expect(result.items).toHaveLength(6);
    expect(result.items.map((item) => item.price)).toEqual([1590, 550, 4690, 3490, 2490, -610]);
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[5].name).toBe('酷幣優惠折扣');
    expect(sumReceiptItems(result.items)).toBe(12200);
  });

  it('extracts all seven computer-store rows including a free mousepad and discount', () => {
    const result = parseReceiptText(`退 貨 說 明
原 價 屋 電 腦 ( 股 ) 公 司 光 華 分 公 司
es 生
商品名稱 數量 單價 金額
利民 Silver Soul 135 散熱器
1 1590 1590TX
利民 TL-C12 PRO-G 12cm 風扇 1 550 550TX
F.D Torrent Nano RGB 玻璃機殼 1 4690 4690TX
ASUS ROG Strix Scope RX PBT 鍵盤 1 3490 3490TX
ASUS ROG Mouse Pad 鼠墊 1 0 0TX
ASUS ROG Pugio II 滑鼠 1 2490 2490TX
酷幣優惠折扣 -1 610 -610TX
合計 11619
稅額 581
總計 12200`);
    expect(result.title).toBe('購物消費');
    expect(result.amount).toBe(12200);
    expect(result.items.map((item) => item.price)).toEqual([1590, 550, 4690, 3490, 0, 2490, -610]);
    expect(result.items.map((item) => item.name)).toEqual([
      '利民 Silver Soul 135 散熱器',
      '利民 TL-C12 PRO-G 12cm 風扇',
      'F.D Torrent Nano RGB 玻璃機殼',
      'ASUS ROG Strix Scope RX PBT 鍵盤',
      'ASUS ROG Mouse Pad 鼠墊',
      'ASUS ROG Pugio II 滑鼠',
      '酷幣優惠折扣',
    ]);
    expect(sumReceiptItems(result.items)).toBe(12200);
  });

  it('prefers a merchant over a short OCR fragment in the heading', () => {
    const result = parseReceiptText('es 生\n原價屋電腦(股)公司光華分公司\n風扇 550TX\n總計 550');
    expect(result.title).toBe('原價屋電腦');
  });

  it('makes a positive-looking discount negative and preserves a zero-priced product', () => {
    const result = parseReceiptText('好買商店\n鼠墊 0TX\n優惠折扣 610TX\n總計 -610');
    expect(result.items).toEqual([{ name: '鼠墊', price: 0 }, { name: '優惠折扣', price: -610 }]);
  });

  it('keeps model numbers inside a product name when only the final number is a price', () => {
    const result = parseReceiptText('電腦商城\nSilver Soul 135 散熱器 1590TX\n總計 2000');
    expect(result.items).toEqual([{ name: 'Silver Soul 135 散熱器', price: 1590 }]);
  });

  it('uses a localized shopping title when merchant is absent, and rejects noisy headings', () => {
    expect(parseReceiptText('TAX INVOICE\n商品名稱 數量 金額\n黑門市場便當 1 850円\n茶飲 1 100円\n合計 950円')).toMatchObject({ title: '購物消費', amount: 950 });
    expect(parseReceiptText('RECEIPT\n*** /// !!!\nTEL 12345678')).toMatchObject({ title: 'Shopping' });
  });

  it('parses English line-item headers and negative discounts', () => {
    const result = parseReceiptText('Tokyo Store\nITEM QTY PRICE\nNotebook 2 300\nCoupon -100\nTOTAL 200');
    expect(result.items).toEqual([{ name: 'Notebook', quantity: 2, price: 300 }, { name: 'Coupon', price: -100 }]);
  });

  it('removes NT$ and tax suffixes from item prices', () => {
    const result = parseReceiptText('光華商店\n商品名稱 數量 金額\n散熱器 1 NT$1,590TX\n總計 NT$1,690');
    expect(result.items).toEqual([{ name: '散熱器', quantity: 1, price: 1590 }]);
    expect(result.amount).toBe(1690);
  });

  it('keeps the final amount but discards incomplete details from spaced, headerless OCR fragments', () => {
    const raw = `1 返 責 主 ) 語 塌 丁 調 二 0 |
原 貞 蝦 電 腦 ( 股 ) 公 司 光 華 分 公 司
和 民 Silver Soul 135 M 品
1 1590 1590TA A
酷 閣 依 惠 折 扣 -610T)
合 計 : 11619
稅 額 : 581
(# 1 12200 +`;
    const result = parseReceiptText(raw);
    expect(result.title).toBe('購物消費');
    expect(result.amount).toBe(12200);
    expect(result.items).toEqual([]);
  });

  it('keeps only readable products and corrects known OCR product typos', () => {
    const result = parseReceiptText(`原 價 屋 電 腦 ( 股 ) 公 司
商品名稱 數量 單價 金額
Silver S0u1 135 散熱器 1 1590 1590TA
es 生 340
人 人 人 120
- 和 50
ti 60
Fe 多 80
| bad 90
酷 閣 依 惠 折 扣 -610T)
總計 980`);
    expect(result.items).toEqual([
      { name: 'Silver Soul 135 散熱器', quantity: 1, price: 1590 },
      { name: '酷幣優惠折扣', price: -610 },
    ]);
    expect(result.amount).toBe(980);
  });

  it('keeps low-priced named products but skips explicit totals', () => {
    const result = parseReceiptText('好買商店\n商品名稱 金額\n風扇 550\n測試商品 5\n總計 555');
    expect(result.items).toEqual([{ name: '風扇', price: 550 }, { name: '測試商品', price: 5 }]);
    expect(result.amount).toBe(555);
  });

  it('returns no items and a generic shopping title when every OCR name is noise', () => {
    const result = parseReceiptText('原 貞 蝦 電 腦 ( 股 ) 公 司\nes 生 1590\n人 人 人 550\nFe 多 4690\n總計 12200');
    expect(result.items).toEqual([]);
    expect(result.title).toBe('購物消費');
    expect(result.amount).toBe(12200);
  });

  it('ignores spaced receipt warnings and header text as merchant names', () => {
    const result = parseReceiptText('退 貨 說 明\n發 票 正 本\n歡 迎 光 臨\n載 具 明 細\n原 價 屋 電 腦 ( 股 ) 公 司 光 華 分 公 司\n散熱器 1590TX\n總 計 1690');
    expect(result.title).toBe('購物消費');
    expect(result.items).toEqual([{ name: '散熱器', price: 1590 }]);
  });

  it('rejects dates, phone numbers, and tax rows while scanning without an item header', () => {
    const result = parseReceiptText('好買商店\n電話 02-23972669\n日期 2022-02-12\n風扇 550TA A\n稅額 20\n總計 570');
    expect(result.items).toEqual([{ name: '風扇', price: 550 }]);
    expect(result.amount).toBe(570);
  });

  it('never turns footer warnings or nearby isolated numbers into products', () => {
    const result = parseReceiptText(`購物消費
商品名稱 金額
散熱器 1590
王計 12200
十扣 花：/ 螺睦 3
3
退貨 發票存根 正本載具
總計 1590`);
    expect(result.items).toEqual([{ name: '散熱器', price: 1590 }]);
  });

  it('drops incomplete low-confidence details while keeping the reliable total', () => {
    const result = parseReceiptText(`發票明細
商品名稱 金額
Silver Soul 135 散熱器 1590TX
十扣 花：/ 螺睦
數量 3
王計 12200`);
    expect(result).toMatchObject({ title: '購物消費', amount: 12200, items: [] });
  });

  it('keeps a complete single-item receipt when tax explains the total difference', () => {
    const result = parseReceiptText('好買商店\n商品名稱 金額\n風扇 550\n稅額 20\n總計 570');
    expect(result.items).toEqual([{ name: '風扇', price: 550 }]);
    expect(result.title).toBe('好買商店');
  });

  it('parses Japanese and Korean total keywords', () => {
    expect(parseReceiptText('大阪店\n小計 ¥1,280\n')).toMatchObject({ amount: 1280, currency: 'JPY' });
    expect(parseReceiptText('서울 식당\n결제금액 ₩18,000\n')).toMatchObject({ amount: 18000, currency: 'KRW' });
  });

  it('parses English currency, tax and a discount after subtotal without treating tax as an item', () => {
    const result = parseReceiptText(`RECEIPT
ITEM QTY PRICE
Coffee Beans 1 $1,200.00
Subtotal $1,200.00
Member Discount -$200.00
Sales Tax $50.00
Grand Total $1,050.00`);
    expect(result).toMatchObject({ title: 'Shopping', amount: 1050, currency: 'USD' });
    expect(result.items).toEqual([
      { name: 'Coffee Beans', quantity: 1, price: 1200 },
      { name: 'Member Discount', price: -200 },
    ]);
  });

  it('parses Japanese discounts and total independently of the merchant', () => {
    const result = parseReceiptText(`領収書
商品名 数量 金額
文房具 1 ¥550
特別割引 ¥50
合計 ¥500`);
    expect(result).toMatchObject({ amount: 500, currency: 'JPY' });
    expect(result.items).toEqual([
      { name: '文房具', quantity: 1, price: 550 },
      { name: '特別割引', price: -50 },
    ]);
  });

  it('supports European comma decimals and an Amount Due total', () => {
    const result = parseReceiptText(`RECEIPT
ITEM PRICE
Museum Ticket €12,50
Amount Due €12,50`);
    expect(result).toMatchObject({ title: 'Shopping', amount: 12.5, currency: 'EUR' });
    expect(result.items).toEqual([{ name: 'Museum Ticket', price: 12.5 }]);
    expect(parseReceiptText('ITEM PRICE\nMuseum Ticket €12.50\nAmount Due €12.50')).toMatchObject({ amount: 12.5, currency: 'EUR' });
  });

  it('keeps Japanese and Korean product names without requiring Han or English text', () => {
    expect(parseReceiptText('商品名 金額\nカレー ¥550\n合計 ¥550').items).toEqual([{ name: 'カレー', price: 550 }]);
    expect(parseReceiptText('ITEM PRICE\n김치 ₩8,000\n합계 ₩8,000').items).toEqual([{ name: '김치', price: 8000 }]);
  });

  it('derives a merchant generically without a merchant-specific name rule', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'lib/receipt-ocr.ts'), 'utf8');
    expect(source).not.toContain("startsWith('原價屋')");
    expect(parseReceiptText('北斗電腦(股)公司台北分公司\n商品名稱 金額\n鍵盤 550\n總計 550').title).toBe('北斗電腦');
  });

  it('falls back to the largest receipt number while ignoring dates and quantities', () => {
    expect(parseReceiptText('2026/09/24\n商品 2 個 120\n商品 1 個 980\n')).toMatchObject({ amount: 980 });
  });

  it('prefers the bottom receipt total over a corrupted duplicate item price', () => {
    const raw = `退貨發票明細
1 二 小 1590 1590TX 同 人 辣 1
衣 各 點 lamNan0 RDB 時 / 淺 色 玻 珮 ee
記 旨 說 說 1 4690 46901 四 ~ 計 和
AS 革 人 Bc0ne Rx BT 機 帳 式 有
史 31 司 3490 3490g0TX ee 同
2430 2490D 二 人
點 國 610 ~610TX 版 ww 1
(# 1 12200 +`;
    expect(parseReceiptText(raw).amount).toBe(12200);
  });

  it('does not invent a total from a corrupted item price when the footer is unreadable', () => {
    expect(parseReceiptText('機殼 1 4690 46901\n鍵盤 1 3490 3490TX\n滑鼠 1 2490 2490D').amount).toBeNull();
  });

  it('removes the receipt scan entry point while preserving OCR utilities and manual receipt items', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    const scanner = readFileSync(path.resolve(process.cwd(), 'src/components/ReceiptScanButton.tsx'), 'utf8');
    expect(source).not.toContain('ReceiptScanButton');
    expect(source).not.toContain('applyReceiptScan');
    expect(source).not.toContain('scanNotice');
    expect(source).toContain('sumReceiptItems(receiptItems)');
    expect(source).toContain('新增明細');
    expect(source).toContain('receipt_items: receiptItems.map');
    expect(scanner).toContain('launchCameraAsync');
    expect(scanner).toContain('recognizeReceiptWithTesseract');
    const ocr = readFileSync(path.resolve(process.cwd(), 'lib/receipt-ocr.ts'), 'utf8');
    expect(ocr).toContain("createWorker('chi_tra+eng+jpn+kor')");
    expect(ocr).toContain("[OCR] Raw parsed text:");
    expect(ocr).toContain('preprocessReceiptImage');
  });

  it('provides editable receipt rows and a live total comparison in the expense modal', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ExpenseModal.tsx'), 'utf8');
    expect(source).toContain('setReceiptItems(expense?.receipt_items ?? [])');
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
