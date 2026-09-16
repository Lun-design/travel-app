import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyItineraryOrder, reorderItineraryItems } from '../lib/itinerary';

const source = (...parts: string[]) => readFileSync(path.resolve(process.cwd(), ...parts), 'utf8');

describe('timeline menu reorder controls', () => {
  const items = [
    { id: 'first', position: 0 },
    { id: 'second', position: 1 },
    { id: 'third', position: 2 },
  ] as any;

  it('moves a middle card down and rewrites positions', () => {
    expect(reorderItineraryItems(items, 1, 2).map((item) => [item.id, item.position])).toEqual([
      ['first', 0], ['third', 1], ['second', 2],
    ]);
  });

  it('moves a middle card up and keeps boundary moves unchanged', () => {
    expect(reorderItineraryItems(items, 1, 0).map((item) => item.id)).toEqual(['second', 'first', 'third']);
    expect(reorderItineraryItems(items, 0, -1)).toBe(items);
    expect(reorderItineraryItems(items, 2, 3)).toBe(items);
  });

  it('applies persisted positions to a fresh array in the parent state order', () => {
    const current = [
      { id: 'first', day_number: 1, position: 0 },
      { id: 'second', day_number: 1, position: 1 },
      { id: 'other-day', day_number: 2, position: 0 },
    ] as any;
    const updated = applyItineraryOrder(current, [
      { id: 'second', position: 0 },
      { id: 'first', position: 1 },
    ]);

    expect(updated).not.toBe(current);
    expect(updated.filter((item) => item.day_number === 1).map((item) => [item.id, item.position])).toEqual([
      ['second', 0], ['first', 1],
    ]);
    expect(updated.find((item) => item.id === 'other-day')?.position).toBe(0);
  });

  it('keeps the up/down menu wiring while removing drag wrappers and gestures', () => {
    const shared = source('src', 'components', 'ItineraryTimeline.shared.tsx');
    const web = source('src', 'components', 'ItineraryTimeline.web.tsx');
    const native = source('src', 'components', 'ItineraryTimeline.native.tsx');
    const hook = source('src', 'hooks', 'useTripDetailData.ts');
    const tripDetail = source('src', 'app', 'trips', '[id].tsx');

    expect(shared).toContain('onMoveUp');
    expect(shared).toContain('onMoveDown');
    expect(shared).toContain('canMoveUp');
    expect(shared).toContain('canMoveDown');
    expect(shared).toContain('disabled={!canMoveUp}');
    expect(shared).toContain('disabled={!canMoveDown}');
    expect(web).not.toContain('DragDropContext');
    expect(web).not.toContain('Droppable');
    expect(native).not.toContain('DraggableFlatList');
    expect(shared).not.toContain('onLongPress');
    expect(shared).not.toContain('dragTrigger');
    expect(hook).toContain('applyItineraryOrder');
    expect(hook).toContain('await reload()');
    expect(tripDetail).toContain('sortItineraryItemsByPosition');
    expect(web).toContain('sortItineraryItemsByPosition(items)');
    expect(native).toContain('sortItineraryItemsByPosition(items)');
  });
});
