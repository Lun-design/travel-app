import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/components/ItineraryImportModal.tsx', 'utf8');
const tripPageSource = readFileSync('src/app/trips/[id].tsx', 'utf8');

describe('itinerary import modal contract', () => {
  it('offers text and ICS sources with a preview before confirmation', () => {
    expect(source).toContain("useState<ImportSource>('text')");
    expect(source).toContain('上傳 .ics');
    expect(source).toContain('解析並預覽');
    expect(source).toContain('匯入預覽');
    expect(source).toContain('確認匯入');
  });

  it('allows selecting a target trip and offsetting the imported days', () => {
    expect(source).toContain('匯入到哪份行程？');
    expect(source).toContain('從目標行程第幾天開始');
    expect(source).toContain('setTargetTripId');
    expect(source).toContain('dayOffset');
  });

  it('guards parsing and saving states and reports import failures', () => {
    expect(source).toContain("stage === 'saving'");
    expect(source).toContain('匯入失敗，請稍後再試。');
    expect(source).toContain('onConfirm(draft, selectedTrip.id');
    expect(source).toContain("mergeImportedItems(mode === 'overwrite' ? [] : targetItems, parsedPayloads)");
  });

  it('is connected to the trip page and reloads the current itinerary after import', () => {
    expect(tripPageSource).toContain('<ItineraryImportModal');
    expect(tripPageSource).toContain('onConfirm={importIntoTrip}');
    expect(tripPageSource).toContain('const mapped = previewPayloads.length ? previewPayloads : mapDraftToTargetTrip');
    expect(tripPageSource).toContain('await data.reload()');
    expect(tripPageSource).toContain('📥 一鍵匯入行程');
  });
});
