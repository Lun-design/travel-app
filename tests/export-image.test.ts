import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildItineraryCardSvg,
  buildItineraryExportText,
  buildPdfBlobFromJpeg,
  normalizeItineraryExportItems,
  exportItineraryCard,
  type ItineraryExportData,
} from '../lib/export-image';

const sample: ItineraryExportData = {
  title: '東京三日遊',
  destination: '東京',
  dayNumber: 1,
  date: '2026-10-01',
  items: [
    { id: 'a', time: '09:00', location_name: '淺草寺', duration_minutes: 60, address: '東京都台東區淺草 2-3-1', latitude: 35.7148, longitude: 139.7967 },
    { id: 'b', time: '11:30', location_name: '晴空塔', duration_minutes: 90, address: '東京都墨田區押上 1-1-2' },
  ],
};

describe('itinerary image/PDF export helpers', () => {
  it('normalizes export items without mutating the source or dropping address data', () => {
    const items = normalizeItineraryExportItems(sample.items);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: '淺草寺', time: '09:00', durationMinutes: 60, address: '東京都台東區淺草 2-3-1' });
    expect(sample.items[0].location_name).toBe('淺草寺');
  });

  it('builds a shareable text representation with navigation links', () => {
    const text = buildItineraryExportText(sample);
    expect(text).toContain('Day 1 · 2026-10-01');
    expect(text).toContain('09:00 淺草寺 · 停留 60 分鐘');
    expect(text).toContain('地址：東京都台東區淺草 2-3-1');
    expect(text).toContain('https://www.google.com/maps/dir/?api=1&destination=35.7148%2C139.7967&travelmode=driving');
  });

  it('creates escaped SVG markup suitable for PNG conversion or print-to-PDF', () => {
    const svg = buildItineraryCardSvg(sample);
    expect(svg).toContain('<svg');
    expect(svg).toContain('東京三日遊');
    expect(svg).toContain('淺草寺');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('viewBox="0 0 1200 ');
  });

  it('keeps the card visual clean by showing a navigation label instead of the raw URL', () => {
    const svg = buildItineraryCardSvg(sample);
    expect(svg).not.toContain('https://www.google.com/maps/dir/');
    expect(svg).toContain('開啟導航');
    expect(svg).toContain('#F8F6F0');
    expect(svg).toContain('#9A6A45');
  });

  it('builds a downloadable PDF Blob without requiring window.print', async () => {
    const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';
    const blob = buildPdfBlobFromJpeg(jpegDataUrl, 1200, 800);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(100);
    expect(new TextDecoder().decode(await blob.slice(0, 8).arrayBuffer())).toContain('%PDF-1.4');
  });

  it('exposes PNG/PDF choices from the Timeline export action', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/trip-detail/TimelinePanel.tsx'), 'utf8');
    const modal = readFileSync(resolve(process.cwd(), 'src/components/ItineraryCardExport.tsx'), 'utf8');
    expect(source).toContain('匯出行程圖卡');
    expect(source).toContain('<ItineraryCardExport');
    expect(modal).toContain('圖片 PNG');
    expect(modal).toContain('文件 PDF');
    expect(modal).toContain('disabled={busy}');
  });

  it('uses a direct PDF download path without popup or iframe printing', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/export-image.ts'), 'utf8');
    expect(source).toContain('buildPdfBlobFromJpeg');
    expect(source).toContain("canvas.toDataURL('image/jpeg'");
    expect(source).not.toContain("window.open('', '_blank'");
    expect(source).not.toContain("document.createElement('iframe')");
  });

  it('downloads the generated PDF directly as a .pdf file', async () => {
    class MockImage {
      height = 800;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    const canvas = {
      width: 1200,
      height: 800,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='),
    };
    const anchor = {
      style: {} as Record<string, string>,
      click: vi.fn(),
      remove: vi.fn(),
      download: '',
      href: '',
    };
    const createElement = vi.fn((tag: string) => tag === 'canvas' ? canvas : anchor);
    vi.stubGlobal('window', { Image: MockImage });
    vi.stubGlobal('document', {
      createElement,
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });

    try {
      await exportItineraryCard(sample, 'pdf');
      expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.92);
      expect(anchor.download).toContain('.pdf');
      expect(anchor.click).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exposes a print-in-progress state for PDF exports', () => {
    const modal = readFileSync(resolve(process.cwd(), 'src/components/ItineraryCardExport.tsx'), 'utf8');
    expect(modal).toContain('openPdfExport');
    expect(modal).toContain('列印準備中');
    expect(modal).toContain('下載 PDF');
    expect(modal).not.toContain('開啟列印並儲存 PDF');
  });
});
