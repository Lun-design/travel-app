import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('timeline and itinerary editor UX simplification', () => {
  it('keeps route pills focused on time and distance only', () => {
    const timeline = source('src/components/ItineraryTimeline.shared.tsx');
    expect(timeline).not.toContain('nextScheduled?.bufferMinutes');
    expect(timeline).not.toContain('segment.navigationUrl ? <Pressable');
  });

  it('places cost and category controls in a compact editor row', () => {
    const modal = source('src/components/ItineraryItemModal.tsx');
    expect(modal).toContain('styles.compactFieldRow');
    expect(modal).toContain('styles.compactField');
    expect(modal).toContain('estimatedCost');
    expect(modal).toContain('setCategory');
  });

  it('keeps weekly hours collapsed until the user expands them', () => {
    const modal = source('src/components/ItineraryItemModal.tsx');
    expect(modal).toContain('const [showOpeningHours, setShowOpeningHours] = useState(false);');
    expect(modal).toContain('setShowOpeningHours((current) => !current)');
    expect(modal).toContain('{showOpeningHours ? <OpeningHoursEditor');
  });

  it('uses a lightweight coordinate hint instead of a web map placeholder panel', () => {
    const map = source('src/components/ManualLocationMap.web.tsx');
    expect(map).not.toContain('Web 版暫不支援拖曳地圖 Marker');
    expect(map).toContain('styles.coordinateHint');
  });
});
