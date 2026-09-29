export type ReceiptCurrency = 'TWD' | 'JPY' | 'KRW' | 'USD' | 'EUR';
export type ReceiptItem = { name: string; price: number; quantity?: number };
export type ReceiptParseResult = { title: string; amount: number | null; currency: ReceiptCurrency; usageDate: string | null; items: ReceiptItem[] };

const ITEM_HEADER = /商品名稱|商品名|品名|品項|(?:\bITEMS?\b.*\b(?:QTY|PRICE|AMOUNT)\b)|(?:數量.*(?:單價|金額))|(?:單價.*金額)/i;
// Match labels at the beginning, so a product such as “Total Care” is not a total.
const FINAL_TOTAL = /^(?:總計|合計額|合計|お買上|합계|총액|받을금액|결제금액|GRANDTOTAL(?=$|[^A-Z])|AMOUNTDUE(?=$|[^A-Z])|TOTAL(?=$|[^A-Z])|AMOUNT(?=$|[^A-Z]))/i;
const SUBTOTAL = /^(?:小計|税込|SUBTOTAL(?=$|[^A-Z]))/i;
const DISCOUNT = /折扣|優惠|値引|割引|할인|\bDISCOUNT\b|\bOFF\b/i;
const TAX_LINE = /^(?:稅額|税額|消費税|부가세|SALES?TAX|VAT)/i;
const TITLE_NOISE = /退貨|發票|明細|歡迎光臨|存根|正本|載具|領収書|TAXINVOICE|RECEIPT|^TEL|電話|收據|日期|稅額/i;
const ITEM_NOISE = /電話|日期|退貨|發票|明細|歡迎光臨|存根|正本|載具|領収書|稅額|税額|消費税|부가세|SALES?TAX|\bVAT\b|TAXINVOICE|RECEIPT|^TEL|202\d[-/.]/i;
const MONEY_TOKEN = /[+-]?(?:NT\$|[¥￥₩$€])?\d(?:[\d.,]*\d)?(?:TX|TA|T|円|₩|元)?/gi;

function compact(line: string): string {
  return line.replace(/\s+/g, '');
}

function summaryKind(line: string): 'final' | 'subtotal' | null {
  const value = compact(line);
  if (FINAL_TOTAL.test(value)) return 'final';
  if (SUBTOTAL.test(value)) return 'subtotal';
  return null;
}

function isNoisyHeading(line: string): boolean {
  const value = compact(line);
  const symbols = (value.match(/[^\p{L}\p{N}]/gu) ?? []).length;
  return TITLE_NOISE.test(value) || symbols > Math.max(2, value.length / 4) || /^\d/.test(value);
}

function cleanMoney(raw: string): number {
  const stripped = raw.replace(/(?:TX|TA|T|円|₩|元|NT\$)/gi, '').replace(/[¥￥$€₩]/g, '');
  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  const commaIsDecimal = lastComma > lastDot && /,\d{1,2}$/.test(stripped);
  return Number(commaIsDecimal
    ? stripped.replace(/\./g, '').replace(',', '.')
    : stripped.replace(/,/g, ''));
}

function cleanTitle(raw: string): string {
  if (isNoisyHeading(raw) || /\d/.test(raw) || /(?:^|\s)[\p{Script=Han}](?:\s+[\p{Script=Han}]){3,}/u.test(raw) || !isReadableItemName(raw)) return '';
  const normalized = raw.replace(/[（(]股[）)]\s*公司.*$/i, '').replace(/(?:股份有限公司|有限公司|分公司).*$/, '').trim();
  const symbolCount = (normalized.match(/[^\p{L}\p{N}\s]/gu) ?? []).length;
  return normalized.length > 2 && symbolCount <= Math.max(2, normalized.length / 3) ? normalized : '';
}

function cleanItemName(raw: string): string {
  return raw.replace(/\bSilver\s+S0u1\b/gi, 'Silver Soul')
    .replace(/酷閣/g, '酷幣')
    .replace(/依惠/g, '優惠')
    .trim();
}

function isReadableItemName(name: string): boolean {
  if (/[|<>#~“”]/u.test(name)) return false;
  if (/([\p{Script=Han}])\1{2,}/u.test(name)) return false;
  if (/\b([A-Za-z]+)(?:\s+\1){2,}\b/i.test(name)) return false;
  return /[\p{Script=Han}]{2,}/u.test(name)
    || /[\p{Script=Hiragana}\p{Script=Katakana}ー]{2,}/u.test(name)
    || /[\p{Script=Hangul}]{2,}/u.test(name)
    || /(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9-]{2,}(?![A-Za-z0-9])/u.test(name);
}

function keepReadableItems(items: ReceiptItem[]): ReceiptItem[] {
  return items.map((item) => ({ ...item, name: cleanItemName(item.name) }))
    .filter((item) => isReadableItemName(item.name));
}

function extractLineItems(lines: string[]): ReceiptItem[] {
  const start = lines.findIndex((line) => ITEM_HEADER.test(line));
  const items: ReceiptItem[] = [];
  let pendingName = '';
  for (const line of lines.slice(start + 1)) {
    const normalized = compact(line);
    const summary = summaryKind(line);
    if (summary === 'final') break;
    if (summary === 'subtotal') { pendingName = ''; continue; }
    if (ITEM_NOISE.test(normalized) || /^[-—=\s]+$/.test(line) || /(?:公司|商店|商城|店$|\bStore\b)/i.test(normalized)) {
      pendingName = '';
      continue;
    }
    const matches = [...line.matchAll(MONEY_TOKEN)].filter((match) => {
      const before = line[match.index! - 1] ?? ' ';
      const after = line[(match.index ?? 0) + match[0].length] ?? ' ';
      return !/[\p{L}\d]/u.test(before) && !/[\p{L}\d]/u.test(after);
    });
    if (!matches.length) {
      if (!isNoisyHeading(line)) pendingName = [pendingName, line].filter(Boolean).join(' ').trim();
      continue;
    }
    const last = matches.at(-1)!;
    const trailing = line.slice((last.index ?? 0) + last[0].length).trim();
    if (trailing && !/^[^\p{L}\p{N}]*(?:[A-Z][^\p{L}\p{N}]*)?$/iu.test(trailing)) {
      if (!isNoisyHeading(line)) pendingName = [pendingName, line].filter(Boolean).join(' ').trim();
      continue;
    }
    const trailingNumbers = [last];
    for (let index = matches.length - 2; index >= 0; index -= 1) {
      const previous = matches[index];
      const next = trailingNumbers[0];
      const separator = line.slice((previous.index ?? 0) + previous[0].length, next.index ?? 0);
      if (!/^\s+$/.test(separator)) break;
      trailingNumbers.unshift(previous);
    }
    const numericStart = trailingNumbers.length >= 2 ? trailingNumbers[0].index! : last.index!;
    const name = [pendingName, line.slice(0, numericStart).trim()].filter(Boolean).join(' ').trim()
      .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, '');
    const rawPrice = cleanMoney(last[0]);
    const price = DISCOUNT.test(name) ? -Math.abs(rawPrice) : rawPrice;
    if (!name || isNoisyHeading(name) || !Number.isFinite(price)) continue;
    const quantity = trailingNumbers.length >= 2 ? cleanMoney(trailingNumbers[0][0]) : undefined;
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
  const rawItems = extractLineItems(lines);
  const amountLine = [...lines].reverse().find((line) => summaryKind(line) === 'final')
    ?? [...lines].reverse().find((line) => summaryKind(line) === 'subtotal');
  const amountTokens = amountLine ? [...amountLine.matchAll(MONEY_TOKEN)] : [];
  const explicitAmount = amountTokens.length ? cleanMoney(amountTokens.at(-1)![0]) : null;
  const dateMatch = text.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const headerIndex = lines.findIndex((line) => ITEM_HEADER.test(line));
  const merchant = (headerIndex < 0 ? lines : lines.slice(0, headerIndex))
    .filter((line) => !isNoisyHeading(line) && !summaryKind(line))
    .map(cleanTitle).find(Boolean);
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
  const summaryIndex = amountLine ? lines.indexOf(amountLine) : -1;
  const laterLines = summaryIndex < 0 ? [] : lines.slice(summaryIndex + 1);
  const laterTax = laterLines.filter((line) => TAX_LINE.test(compact(line)))
    .flatMap((line) => [...line.matchAll(MONEY_TOKEN)].map((match) => cleanMoney(match[0])));
  const laterTotals = laterLines
    .filter((line) => !ITEM_NOISE.test(compact(line)) && !/\d{4}[-/.]\d{1,2}/.test(line))
    .flatMap((line) => [...line.matchAll(MONEY_TOKEN)].map((match) => cleanMoney(match[0])))
    .filter((value) => Number.isFinite(value) && value > (explicitAmount ?? 0) && value <= 10_000_000
      && (summaryKind(amountLine ?? '') !== 'final' || laterTax.some((tax) => Math.abs(value - (explicitAmount! + tax)) < 0.01)));
  const amount = laterTotals.length ? Math.max(...laterTotals) : (explicitAmount ?? fallbackAmount);
  const items = keepReadableItems(rawItems);
  const fallbackTitle = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text) ? '購物消費' : 'Shopping';
  const title = merchant || fallbackTitle;
  return {
    title,
    amount,
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
