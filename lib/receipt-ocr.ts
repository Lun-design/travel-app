export type ReceiptCurrency = 'TWD' | 'JPY' | 'KRW' | 'USD' | 'EUR';
export type ReceiptParseResult = { title: string; amount: number | null; currency: ReceiptCurrency; usageDate: string | null };

function parseCurrency(text: string): ReceiptCurrency {
  if (/¥|￥|日幣|jpy/i.test(text)) return 'JPY';
  if (/₩|韓元|krw/i.test(text)) return 'KRW';
  if (/\$|美金|usd/i.test(text)) return 'USD';
  if (/€|歐元|eur/i.test(text)) return 'EUR';
  return 'TWD';
}

export function parseReceiptText(text: string): ReceiptParseResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amountMatch = text.match(/(?:合計|總計|total|amount|應付|金額)\s*[:：]?\s*[¥￥₩$€]?\s*([\d,]+(?:\.\d{1,2})?)/i)
    ?? text.match(/[¥￥₩$€]\s*([\d,]+(?:\.\d{1,2})?)/);
  const dateMatch = text.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const title = lines.find((line) => !/(合計|總計|total|amount|金額|\d{4}[\/.\-]\d{1,2})/i.test(line)) ?? '收據支出';
  return {
    title,
    amount: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null,
    currency: parseCurrency(text),
    usageDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : null,
  };
}

/** OCR adapter; the Tesseract worker is injected by the UI to keep tests/node builds light. */
export async function recognizeReceiptImage(image: unknown, recognize: (image: unknown) => Promise<string>): Promise<ReceiptParseResult> {
  return parseReceiptText(await recognize(image));
}

/** Runs entirely on-device. The worker is created per scan and always terminated. */
export async function recognizeReceiptWithTesseract(image: string | Blob): Promise<ReceiptParseResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(image);
    return parseReceiptText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
