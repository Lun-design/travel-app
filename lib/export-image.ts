import { getGoogleMapsDirectionsUrl } from './map-links';

export type ItineraryExportSource = {
  id: string;
  time?: string | null;
  start_time?: string | null;
  location_name: string;
  duration_minutes?: number | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  category?: string | null;
};

export type ItineraryExportItem = {
  id: string;
  time: string | null;
  title: string;
  durationMinutes: number;
  address: string | null;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  navigationUrl: string | null;
};

export type ItineraryExportData = {
  title: string;
  destination?: string | null;
  dayNumber: number;
  date?: string | null;
  items: ItineraryExportSource[];
};

export type ItineraryExportFormat = 'png' | 'pdf';

const EXPORT_WIDTH = 1200;
const HEADER_HEIGHT = 190;
const ROW_HEIGHT = 116;
const DEFAULT_DURATION_MINUTES = 60;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function finiteCoordinate(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

/** Converts database itinerary rows into a stable, export-friendly shape. */
export function normalizeItineraryExportItems(items: readonly ItineraryExportSource[]): ItineraryExportItem[] {
  return items.map((item) => {
    const latitude = finiteCoordinate(item.latitude);
    const longitude = finiteCoordinate(item.longitude);
    const duration = Number(item.duration_minutes);
    return {
      id: item.id,
      time: item.time?.trim() || item.start_time?.trim() || null,
      title: item.location_name?.trim() || '未命名景點',
      durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : DEFAULT_DURATION_MINUTES,
      address: item.address?.trim() || null,
      category: item.category?.trim() || null,
      latitude,
      longitude,
      navigationUrl: getGoogleMapsDirectionsUrl(latitude, longitude),
    };
  });
}

/** Builds plain text used by native share and as the accessible export fallback. */
export function buildItineraryExportText(data: ItineraryExportData): string {
  const items = normalizeItineraryExportItems(data.items);
  const header = [`${data.title}${data.destination ? ` · ${data.destination}` : ''}`, `Day ${data.dayNumber}${data.date ? ` · ${data.date}` : ''}`];
  const rows = items.map((item, index) => [
    `${index + 1}. ${item.time ?? '未設定'} ${item.title}${item.category ? `（${item.category}）` : ''} · 停留 ${item.durationMinutes} 分鐘`,
    item.address ? `   地址：${item.address}` : null,
    item.navigationUrl ? `   導航：${item.navigationUrl}` : null,
  ].filter(Boolean).join('\n'));
  return [...header, ...rows].join('\n');
}

/** Creates a self-contained editorial SVG that can be rasterized to PNG or printed to PDF. */
function buildLegacyItineraryCardSvg(data: ItineraryExportData): string {
  const items = normalizeItineraryExportItems(data.items);
  const height = HEADER_HEIGHT + Math.max(items.length, 1) * ROW_HEIGHT + 36;
  const rows = items.length ? items.map((item, index) => {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT;
    const navigation = item.navigationUrl ? '🗺️ 開啟導航' : '尚未設定座標';
    return `<g><rect x="48" y="${y}" width="1104" height="92" rx="16" fill="#F8F6F0" stroke="#E5E2D9"/><circle cx="88" cy="${y + 46}" r="22" fill="#9A6A45"/><text x="88" y="${y + 54}" text-anchor="middle" font-size="20" font-family="Arial,sans-serif" fill="#FFFFFF">${index + 1}</text><text x="130" y="${y + 34}" font-size="25" font-weight="700" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(item.time ?? '未設定')} · ${escapeXml(item.title)}</text><text x="130" y="${y + 61}" font-size="17" font-family="Arial,sans-serif" fill="#756F66">停留 ${item.durationMinutes} 分鐘${item.category ? ` · ${escapeXml(item.category)}` : ''}</text><text x="130" y="${y + 82}" font-size="13" font-family="Arial,sans-serif" fill="#756F66">${escapeXml(item.address ?? '未提供地址')} · ${escapeXml(navigation)}</text></g>`;
  }).join('') : '<text x="600" y="285" text-anchor="middle" font-size="22" font-family="Arial,sans-serif" fill="#756F66">尚未安排景點</text>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${height}" viewBox="0 0 ${EXPORT_WIDTH} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><rect x="24" y="24" width="1152" height="${height - 48}" rx="24" fill="#FFFFFF" stroke="#E5E2D9"/><text x="60" y="82" font-size="36" font-weight="800" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(data.title)}</text><text x="60" y="119" font-size="20" font-family="Arial,sans-serif" fill="#756F66">${escapeXml([data.destination, `Day ${data.dayNumber}`, data.date].filter(Boolean).join(' · '))}</text><line x1="60" y1="145" x2="1140" y2="145" stroke="#E5E2D9"/>${rows}</svg>`;
}

function truncateExportText(value: string, maxLength: number): string {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Builds a compact editorial card; raw navigation URLs stay out of the visual output. */
export function buildItineraryCardSvg(data: ItineraryExportData): string {
  const items = normalizeItineraryExportItems(data.items);
  const height = 300 + Math.max(items.length, 1) * 126;
  const rows = items.length
    ? items.map((item, index) => {
      const y = 246 + index * 126;
      const fill = index % 2 === 0 ? '#F8F6F0' : '#FBFAF6';
      const navigation = item.navigationUrl ? '🗺️ 開啟導航' : '尚未設定座標';
      const address = truncateExportText(item.address ?? '地址待補', 58);
      return `<g><line x1="92" y1="${y - 46}" x2="92" y2="${y + 78}" stroke="#D8C6B8" stroke-width="3"/><circle cx="92" cy="${y}" r="25" fill="#9A6A45"/><text x="92" y="${y + 7}" text-anchor="middle" font-size="20" font-weight="700" font-family="Arial,sans-serif" fill="#FFFFFF">${index + 1}</text><rect x="138" y="${y - 52}" width="1010" height="104" rx="18" fill="${fill}" stroke="#E5E2D9"/><text x="168" y="${y - 16}" font-size="25" font-weight="700" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(item.time ?? '未設定')}  ·  ${escapeXml(truncateExportText(item.title, 34))}</text><text x="168" y="${y + 13}" font-size="16" font-family="Arial,sans-serif" fill="#756F66">停留 ${item.durationMinutes} 分鐘${item.category ? `  ·  ${escapeXml(item.category)}` : ''}</text><text x="168" y="${y + 38}" font-size="14" font-family="Arial,sans-serif" fill="#756F66">${escapeXml(address)}</text><text x="1004" y="${y + 38}" text-anchor="end" font-size="14" font-weight="700" font-family="Arial,sans-serif" fill="#9A6A45">${escapeXml(navigation)}</text></g>`;
    }).join('')
    : '<text x="600" y="300" text-anchor="middle" font-size="22" font-family="Arial,sans-serif" fill="#756F66">尚未安排景點</text>';
  const meta = [data.destination, `Day ${data.dayNumber}`, data.date].filter(Boolean).join('  ·  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><rect width="100%" height="100%" fill="#F1EEE7"/><rect x="28" y="28" width="1144" height="${height - 56}" rx="28" fill="#FFFFFF" stroke="#E5E2D9"/><text x="72" y="88" font-size="16" letter-spacing="3" font-family="Arial,sans-serif" fill="#9A6A45">TRAVEL NOTEBOOK</text><text x="72" y="144" font-size="40" font-weight="800" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(truncateExportText(data.title, 36))}</text><text x="72" y="178" font-size="18" font-family="Arial,sans-serif" fill="#756F66">${escapeXml(meta)}</text><line x1="72" y1="204" x2="1128" y2="204" stroke="#E5E2D9"/>${rows}</svg>`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function downloadPng(data: ItineraryExportData, fileName: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Blob === 'undefined') throw new Error('此裝置不支援圖片匯出。');
  const svg = buildItineraryCardSvg(data);
  const image = new window.Image();
  const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('無法產生行程圖片。')); });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.max(1, Math.ceil(image.height || HEADER_HEIGHT + data.items.length * ROW_HEIGHT + 36));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('此裝置不支援圖片匯出。');
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('無法建立 PNG 檔案。');
  downloadBlob(blob, fileName);
}

async function renderSvgCanvasForPdf(data: ItineraryExportData): Promise<HTMLCanvasElement> {
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('此裝置不支援 PDF 匯出。');
  const image = new window.Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('無法產生 PDF 預覽。'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildItineraryCardSvg(data))}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.max(1, Math.ceil(image.height || HEADER_HEIGHT + data.items.length * ROW_HEIGHT + 36));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('此裝置不支援 PDF 匯出。');
  context.drawImage(image, 0, 0);
  return canvas;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') throw new Error('此裝置不支援 PDF 匯出。');
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

/** Wraps a JPEG data URL in a small, standards-compliant single-page PDF. */
export function buildPdfBlobFromJpeg(jpegDataUrl: string, width: number, height: number): Blob {
  const match = /^data:image\/jpeg;base64,(.+)$/i.exec(jpegDataUrl);
  if (!match) throw new Error('無效的 JPEG 資料。');
  const jpegBytes = decodeBase64(match[1]);
  const encoder = new TextEncoder();
  const pageWidth = 612;
  const pageHeight = Math.max(1, Math.round(pageWidth * height / Math.max(1, width)));
  const pageContent = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q\n`;
  const pageContentBytes = encoder.encode(pageContent);
  const objects: Uint8Array[] = [
    encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encoder.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    encoder.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`),
    concatBytes(encoder.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(width))} /Height ${Math.max(1, Math.round(height))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`), jpegBytes, encoder.encode('\nendstream\nendobj\n')),
    concatBytes(encoder.encode(`5 0 obj\n<< /Length ${pageContentBytes.length} >>\nstream\n`), pageContentBytes, encoder.encode('endstream\nendobj\n')),
  ];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const append = (chunk: Uint8Array) => { chunks.push(chunk); offset += chunk.length; };
  append(encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'));
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(offset);
    append(object);
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}`, '0000000000 65535 f '];
  offsets.slice(1).forEach((entry) => xref.push(`${String(entry).padStart(10, '0')} 00000 n `));
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  append(encoder.encode(`${xref.join('\n')}\n`));
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

async function downloadPdf(data: ItineraryExportData, fileName: string): Promise<void> {
  if (typeof Blob === 'undefined') throw new Error('此裝置不支援 PDF 匯出。');
  const canvas = await renderSvgCanvasForPdf(data);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  downloadBlob(buildPdfBlobFromJpeg(jpegDataUrl, canvas.width, canvas.height), fileName);
}

// PDF is generated as a downloadable file; browser print dialogs are intentionally avoided.

/** Exports PNG directly; PDF uses the browser's native print dialog (Save as PDF). */
export async function exportItineraryCard(data: ItineraryExportData, format: ItineraryExportFormat): Promise<void> {
  const safeTitle = data.title.trim() || '行程圖卡';
  if (format === 'png') return downloadPng(data, `${safeTitle}-Day${data.dayNumber}.png`);
  return downloadPdf(data, `${safeTitle}-Day${data.dayNumber}.pdf`);
}
