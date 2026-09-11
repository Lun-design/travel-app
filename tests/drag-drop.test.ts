import { describe, expect, it } from 'vitest';
import { createDragContainerStyle, createDragPreviewStyle, MOBILE_DRAG_CONFIG, reconcileDraggedItems } from '../lib/drag-drop';

describe('drag and drop layout safeguards', () => {
  it('keeps a dragging preview full-width and clipped to the timeline bounds', () => {
    const style = createDragPreviewStyle({ transform: 'translate(0px, 40px)' }, true);

    expect(style).toMatchObject({
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      overflow: 'hidden',
      zIndex: 20,
      pointerEvents: 'none',
    });
  });

  it('defines a clipped, isolated drop container so previews cannot cover the map', () => {
    expect(createDragContainerStyle()).toMatchObject({
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      contain: 'paint',
      isolation: 'isolate',
    });
  });

  it('requires a deliberate long-press/distance before touch dragging starts', () => {
    expect(MOBILE_DRAG_CONFIG).toEqual(expect.objectContaining({
      activationDistance: 16,
      delayLongPress: 280,
      scrollEnabled: false,
    }));
  });

  it('preserves the local drag order when the parent echoes the same item set', () => {
    const current = [{ id: 'second', title: '原本第二站' }, { id: 'first', title: '第一站' }];
    const parentItems = [{ id: 'first', title: '第一站（已同步）' }, { id: 'second', title: '原本第二站' }];

    const reconciled = reconcileDraggedItems(current, parentItems, (items) => items);

    expect(reconciled).toEqual([
      { id: 'second', title: '原本第二站' },
      { id: 'first', title: '第一站（已同步）' },
    ]);
  });
});
