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
export function buildItineraryCardSvg(data: ItineraryExportData): string {
  const items = normalizeItineraryExportItems(data.items);
  const height = HEADER_HEIGHT + Math.max(items.length, 1) * ROW_HEIGHT + 36;
  const rows = items.length ? items.map((item, index) => {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT;
    const navigation = item.navigationUrl ? `導航：${item.navigationUrl}` : '尚未提供座標導航';
    return `<g><rect x="48" y="${y}" width="1104" height="92" rx="16" fill="#F8F6F0" stroke="#E5E2D9"/><circle cx="88" cy="${y + 46}" r="22" fill="#9A6A45"/><text x="88" y="${y + 54}" text-anchor="middle" font-size="20" font-family="Arial,sans-serif" fill="#FFFFFF">${index + 1}</text><text x="130" y="${y + 34}" font-size="25" font-weight="700" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(item.time ?? '未設定')} · ${escapeXml(item.title)}</text><text x="130" y="${y + 61}" font-size="17" font-family="Arial,sans-serif" fill="#756F66">停留 ${item.durationMinutes} 分鐘${item.category ? ` · ${escapeXml(item.category)}` : ''}</text><text x="130" y="${y + 82}" font-size="13" font-family="Arial,sans-serif" fill="#756F66">${escapeXml(item.address ?? '未提供地址')} · ${escapeXml(navigation)}</text></g>`;
  }).join('') : '<text x="600" y="285" text-anchor="middle" font-size="22" font-family="Arial,sans-serif" fill="#756F66">尚未安排景點</text>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${height}" viewBox="0 0 ${EXPORT_WIDTH} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><rect x="24" y="24" width="1152" height="${height - 48}" rx="24" fill="#FFFFFF" stroke="#E5E2D9"/><text x="60" y="82" font-size="36" font-weight="800" font-family="Arial,sans-serif" fill="#1F1F1F">${escapeXml(data.title)}</text><text x="60" y="119" font-size="20" font-family="Arial,sans-serif" fill="#756F66">${escapeXml([data.destination, `Day ${data.dayNumber}`, data.date].filter(Boolean).join(' · '))}</text><line x1="60" y1="145" x2="1140" y2="145" stroke="#E5E2D9"/>${rows}</svg>`;
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

async function printPdf(data: ItineraryExportData): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('此裝置不支援 PDF 匯出。');
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) throw new Error('瀏覽器封鎖了列印視窗，請允許彈出視窗後再試。');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>${escapeXml(data.title)}</title><style>@page{size:auto;margin:12mm}body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>${buildItineraryCardSvg(data)}</body></html>`);
  printWindow.document.close();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

/** Exports PNG directly; PDF uses the browser's native print dialog (Save as PDF). */
export async function exportItineraryCard(data: ItineraryExportData, format: ItineraryExportFormat): Promise<void> {
  const safeTitle = data.title.trim() || '行程圖卡';
  if (format === 'png') return downloadPng(data, `${safeTitle}-Day${data.dayNumber}.png`);
  return printPdf(data);
}
