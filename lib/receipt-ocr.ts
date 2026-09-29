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
  const totalKeywords = '總計|合計|金額|TOTAL|AMOUNT|SUBTOTAL|小計|合計額|お買上|税込|합계|총액|받을금액|결제금액';
  const amountMatch = text.match(new RegExp(`(?:${totalKeywords})\\s*[:：]?\\s*[¥￥₩$€]?\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'i'))
    ?? text.match(/[¥￥₩$€]\s*([\d,]+(?:\.\d{1,2})?)/);
  const dateMatch = text.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const title = lines.find((line) => !/(合計|總計|total|amount|金額|\d{4}[\/.\-]\d{1,2})/i.test(line)) ?? '收據支出';
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
    amount: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : fallbackAmount,
    currency: parseCurrency(text),
    usageDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : null,
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
