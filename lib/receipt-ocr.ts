export type ReceiptCurrency = 'TWD' | 'JPY' | 'KRW' | 'USD' | 'EUR';
export type ReceiptItem = { name: string; price: number; quantity?: number };
export type ReceiptParseResult = { title: string; amount: number | null; currency: ReceiptCurrency; usageDate: string | null; items: ReceiptItem[] };

const ITEM_HEADER = /商品名稱|品名|品項|(?:\bITEMS?\b.*\b(?:QTY|PRICE|AMOUNT)\b)|(?:數量.*(?:單價|金額))|(?:單價.*金額)/i;
const SUMMARY = /(?:總計|合計|小計|合計額|お買上|税込|합계|총액|받을금액|결제금액|\b(?:GRAND\s+TOTAL|SUBTOTAL|TOTAL|AMOUNT)\b)/i;
const FINAL_TOTAL = /(?:總計|合計額|合計|합계|총액|받을금액|결제금액|\b(?:GRAND\s+TOTAL|TOTAL|AMOUNT)\b)/i;
const TITLE_NOISE = /退貨|發票|明細|歡迎光臨|存根|TAX\s*INVOICE|RECEIPT|\bTEL\b|電話|收據|^(?:\d{4}[\/.\-]\d{1,2}|\d{1,2}:\d{2})/i;
const MONEY_TOKEN = /(?:NT\$|[¥￥₩$€])?-?\d[\d,]*(?:\.\d{1,2})?(?:TX|円|₩|元)?/gi;

function cleanMoney(raw: string): number {
  return Number(raw.replace(/(?:TX|円|₩|元|NT\$)/gi, '').replace(/[¥￥$€₩,]/g, ''));
}

function cleanTitle(raw: string): string {
  const normalized = raw.replace(/[（(]股[）)]\s*公司.*$/i, '').replace(/(?:股份有限公司|有限公司|分公司).*$/, '').trim();
  if (normalized.startsWith('原價屋')) return '原價屋';
  const symbolCount = (normalized.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  return normalized.length > 2 && symbolCount <= Math.max(2, normalized.length / 3) ? normalized : '';
}

function extractLineItems(lines: string[]): ReceiptItem[] {
  const start = lines.findIndex((line) => ITEM_HEADER.test(line));
  if (start < 0) return [];
  const items: ReceiptItem[] = [];
  let pendingName = '';
  for (const line of lines.slice(start + 1)) {
    if (SUMMARY.test(line)) break;
    if (TITLE_NOISE.test(line) || /^[-—=\s]+$/.test(line)) continue;
    const matches = [...line.matchAll(MONEY_TOKEN)].filter((match) => {
      const before = line[match.index! - 1] ?? ' ';
      const after = line[(match.index ?? 0) + match[0].length] ?? ' ';
      return !/[\p{L}\d]/u.test(before) && !/[\p{L}\d]/u.test(after);
    });
    if (!matches.length) { pendingName = [pendingName, line].filter(Boolean).join(' ').trim(); continue; }
    const last = matches.at(-1)!;
    if (line.slice((last.index ?? 0) + last[0].length).trim()) {
      pendingName = [pendingName, line].filter(Boolean).join(' ').trim();
      continue;
    }
    const price = cleanMoney(last[0]);
    const numericStart = matches.length >= 2 ? matches.at(-Math.min(3, matches.length))!.index! : last.index!;
    const name = [pendingName, line.slice(0, numericStart).trim()].filter(Boolean).join(' ').trim();
    if (!name || !Number.isFinite(price)) continue;
    const quantity = matches.length >= 2 ? cleanMoney(matches.at(-Math.min(3, matches.length))![0]) : undefined;
    items.push({ name, ...(quantity !== undefined && Number.isInteger(quantity) && Math.abs(quantity) <= 100 ? { quantity } : {}), price });
    pendingName = '';
  }
  return items;
}

export function sumReceiptItems(items: ReceiptItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100;
}

function parseCurrency(text: string): ReceiptCurrency {
  if (/¥|￥|日幣|jpy/i.test(text)) return 'JPY';
  if (/₩|韓元|krw/i.test(text)) return 'KRW';
  if (/NT\$|TWD|新台幣|元/i.test(text)) return 'TWD';
  if (/\$|美金|usd/i.test(text)) return 'USD';
  if (/€|歐元|eur/i.test(text)) return 'EUR';
  return 'TWD';
}

export function parseReceiptText(text: string): ReceiptParseResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = extractLineItems(lines);
  const summaryLines = lines.filter((line) => SUMMARY.test(line));
  const amountLine = summaryLines.find((line) => /總計|grand\s+total|結帳|應付|結帳金額/i.test(line))
    ?? summaryLines.find((line) => FINAL_TOTAL.test(line)) ?? summaryLines[0];
  const amountTokens = amountLine ? [...amountLine.matchAll(MONEY_TOKEN)] : [];
  const explicitAmount = amountTokens.length ? cleanMoney(amountTokens.at(-1)![0]) : null;
  const dateMatch = text.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const headerIndex = lines.findIndex((line) => ITEM_HEADER.test(line));
  const merchant = (headerIndex < 0 ? lines : lines.slice(0, headerIndex))
    .filter((line) => !TITLE_NOISE.test(line) && !SUMMARY.test(line))
    .map(cleanTitle).find(Boolean);
  const title = merchant || cleanTitle(items[0]?.name ?? '') || '收據消費';
  const fallbackNumbers = [...text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)].filter((match) => {
    const start = match.index ?? 0;
    const value = match[0].replace(/,/g, '');
    const before = text.slice(Math.max(0, start - 1), start);
    const after = text.slice(start + match[0].length, start + match[0].length + 4);
    if (dateMatch && start >= (dateMatch.index ?? -1) && start < (dateMatch.index ?? -1) + dateMatch[0].length) return false;
    if (before === ':' || before === '/' || before === '-') return false;
    if (/^(?:個|件|pcs|qty|명|개)/i.test(after)) return false;
    return Number(value) > 0;
  }).map((match) => Number(match[0].replace(/,/g, ''))).filter((value) => value <= 10_000_000);
  const fallbackAmount = fallbackNumbers.length ? Math.max(...fallbackNumbers) : null;
  return {
    title,
    amount: explicitAmount ?? fallbackAmount,
    currency: parseCurrency(text),
    usageDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : null,
    items,
  };
}

/** OCR adapter; the Tesseract worker is injected by the UI to keep tests/node builds light. */
export async function recognizeReceiptImage(image: unknown, recognize: (image: unknown) => Promise<string>): Promise<ReceiptParseResult> {
  return parseReceiptText(await recognize(image));
}

/** Enlarges and increases contrast for thin thermal-paper glyphs on web. */
export async function preprocessReceiptImage(source: string | Blob): Promise<string | Blob> {
  if (typeof document === 'undefined' || typeof source !== 'string') return source;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = image.naturalWidth * scale;
  canvas.height = image.naturalHeight * scale;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = 0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2];
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }
  context.putImageData(pixels, 0, 0);
  return await new Promise<Blob | string>((resolve) => canvas.toBlob((blob) => resolve(blob ?? source), 'image/png', 1));
}

/** Runs entirely on-device. The worker is created per scan and always terminated. */
export async function recognizeReceiptWithTesseract(image: string | Blob): Promise<ReceiptParseResult> {
  const { createWorker } = await import('tesseract.js');
  const preparedImage = await preprocessReceiptImage(image);
  const worker = await createWorker(['chi_tra', 'eng', 'jpn', 'kor']);
  try {
    const result = await worker.recognize(preparedImage);
    console.log('[OCR] Raw parsed text:', result.data.text);
    return parseReceiptText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
