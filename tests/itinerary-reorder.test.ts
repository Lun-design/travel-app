import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reorderItineraryItems } from '../lib/itinerary';

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

  it('keeps the up/down menu wiring while removing drag wrappers and gestures', () => {
    const shared = source('src', 'components', 'ItineraryTimeline.shared.tsx');
    const web = source('src', 'components', 'ItineraryTimeline.web.tsx');
    const native = source('src', 'components', 'ItineraryTimeline.native.tsx');

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
  });
});
