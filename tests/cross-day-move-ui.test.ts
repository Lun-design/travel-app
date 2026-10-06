import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (...parts: string[]) => readFileSync(path.resolve(process.cwd(), ...parts), 'utf8');

describe('cross-day move timeline wiring', () => {
  it('offers a destination-day picker from the card menu and blocks the current day', () => {
    const timeline = source('src/components/ItineraryTimeline.shared.tsx');
    expect(timeline).toContain('移至其他天');
    expect(timeline).toContain('availableDays.filter((day) => day !== item.day_number)');
    expect(timeline).toContain('onMoveToDay(item, moveTargetDay)');
  });

  it('passes trip days and the cross-day callback through both platform timelines', () => {
    const panel = source('src/components/trip-detail/TimelinePanel.tsx');
    const web = source('src/components/ItineraryTimeline.web.tsx');
    const native = source('src/components/ItineraryTimeline.native.tsx');
    expect(panel).toContain('availableDays={days}');
    expect(panel).toContain('onMoveToDay={onMoveToDay}');
    for (const timeline of [web, native]) {
      expect(timeline).toContain('availableDays');
      expect(timeline).toContain('onMoveToDay');
    }
  });

  it('optimistically moves the item, restores it on failure, and selects the destination day', () => {
    const detail = source('src/app/trips/[id].tsx');
    expect(detail).toContain('async function moveItemToDay');
    expect(detail).toContain('moveItineraryItemAcrossDays');
    expect(detail).toContain('await moveItineraryItemToDay');
    expect(detail).toContain('data.setItems(previousItems)');
    expect(detail).toContain('await data.reload().catch(() => undefined)');
    expect(detail).toContain('setDay(targetDay)');
  });
});
