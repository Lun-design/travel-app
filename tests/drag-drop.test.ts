import { describe, expect, it } from 'vitest';
import { createDragContainerStyle, createDragPreviewStyle, createNativeDragRowStyle, MOBILE_DRAG_CONFIG, MOBILE_GRIP_CONFIG, reconcileDraggedItems, areTimelineCardPropsEqual } from '../lib/drag-drop';

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
      willChange: 'transform',
      backfaceVisibility: 'hidden',
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
      removeClippedSubviews: false,
      dragItemOverflow: false,
    }));
    expect(MOBILE_DRAG_CONFIG.animationConfig).toEqual(expect.objectContaining({
      damping: expect.any(Number),
      stiffness: expect.any(Number),
      overshootClamping: true,
    }));
  });

  it('keeps the measured native drag row mounted and full width', () => {
    expect(createNativeDragRowStyle()).toEqual(expect.objectContaining({
      width: '100%',
      maxWidth: '100%',
      overflow: 'visible',
    }));
  });

  it('keeps a touch gesture captured after a small finger drift', () => {
    expect(MOBILE_GRIP_CONFIG).toEqual({
      delayLongPress: 280,
      pressRetentionOffset: 24,
      hitSlop: 4,
    });
  });

  it('skips TimelineCard re-render when data and interaction state are unchanged', () => {
    const item = { id: 'spot-1', location_name: '景點', category: 'spot', time: '10:00' };
    const callbacks = {
      onEdit: () => undefined,
      onDelete: () => undefined,
    };
    const props = { item, active: false, ...callbacks };

    expect(areTimelineCardPropsEqual(props, { ...props, item: { ...item } })).toBe(true);
    expect(areTimelineCardPropsEqual(props, { ...props, active: true })).toBe(false);
    expect(areTimelineCardPropsEqual(props, { ...props, item: { ...item, time: '11:00' } })).toBe(false);
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
