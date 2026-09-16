import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDragCloneStyle, createDragContainerStyle, createDragOverlayRootStyle, createDragPreviewStyle, createNativeDragRowStyle, createTimelineCardContainerStyle, getDragOverlayContainer, MOBILE_DRAG_CONFIG, MOBILE_GRIP_CONFIG, reconcileDraggedItems, areTimelineCardPropsEqual } from '../lib/drag-drop';

describe('drag and drop layout safeguards', () => {
  const source = (...parts: string[]) => readFileSync(path.resolve(process.cwd(), ...parts), 'utf8');

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
      opacity: 1,
      visibility: 'visible',
    });
  });

  it('uses an isolated fixed-flow clone for rapid long-distance drags', () => {
    const style = createDragCloneStyle({ transform: 'translate(0px, 720px)', position: 'fixed' });

    expect(style).toMatchObject({
      transform: 'translate(0px, 720px)',
      position: 'fixed',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '100%',
      minHeight: '80px',
      overflow: 'hidden',
      contain: 'layout paint',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
      opacity: 1,
      visibility: 'visible',
    });
  });

  it('keeps the overlay portal above every application layer', () => {
    expect(createDragOverlayRootStyle()).toEqual(expect.objectContaining({
      position: 'fixed',
      inset: 0,
      zIndex: 2147483647,
      pointerEvents: 'none',
      overflow: 'visible',
      isolation: 'isolate',
    }));
  });

  it('mounts a dedicated portal root lazily under document.body', () => {
    const body = { appendChild: vi.fn() };
    const root = { id: '', style: {} } as unknown as HTMLElement;
    const documentStub = {
      body,
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => root),
    } as unknown as Document;
    vi.stubGlobal('document', documentStub);

    expect(getDragOverlayContainer()).toBe(root);
    expect(root.id).toBe('itinerary-drag-overlay-root');
    expect(body.appendChild).toHaveBeenCalledWith(root);
    expect(root.style).toMatchObject({ position: 'fixed', zIndex: 2147483647, pointerEvents: 'none' });

    vi.unstubAllGlobals();
  });

  it('preserves the measured card width in the portal clone', () => {
    const style = createDragCloneStyle({ position: 'fixed', width: '312px', height: '148px' });

    expect(style.width).toBe('312px');
    expect(style.height).toBe('148px');
    expect(style.zIndex).toBe(2147483647);
  });

  it('never hides the source preview while a drag clone is mounting', () => {
    const style = createDragPreviewStyle({ opacity: 0 }, true);

    expect(style.opacity).toBe(1);
  });

  it('defines a clipped, isolated drop container so previews cannot cover the map', () => {
    expect(createDragContainerStyle()).toMatchObject({
      position: 'relative',
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      height: 'auto',
      contain: 'paint',
      isolation: 'isolate',
    });
  });

  it('requires a deliberate long-press/distance before touch dragging starts', () => {
    expect(MOBILE_DRAG_CONFIG).toEqual(expect.objectContaining({
      activationDistance: 16,
      delayLongPress: 200,
      delayTouchStart: 200,
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

  it('keeps transport and action children in one bounded card flow', () => {
    expect(createTimelineCardContainerStyle()).toEqual(expect.objectContaining({
      display: 'flex',
      flexDirection: 'column',
      alignSelf: 'stretch',
      position: 'relative',
      width: '100%',
      minWidth: 0,
      overflow: 'hidden',
      height: 'auto',
      boxSizing: 'border-box',
    }));
  });

  it('keeps a touch gesture captured after a small finger drift', () => {
    expect(MOBILE_GRIP_CONFIG).toEqual({
      delayLongPress: 200,
      pressRetentionOffset: 24,
      hitSlop: 4,
    });
  });

  it('starts mobile dragging from the full card after a short long press', () => {
    const native = source('src', 'components', 'ItineraryTimeline.native.tsx');
    const shared = source('src', 'components', 'ItineraryTimeline.shared.tsx');

    expect(native).toContain('onLongPress={drag}');
    expect(native).toContain('{...MOBILE_DRAG_CONFIG}');
    expect(shared).toContain('onLongPress?: () => void');
    expect(shared).toContain('dragTrigger}>{grip}</View>');
    expect(shared).not.toContain('<View style={styles.grip}>');
  });

  it('keeps the category badge and menu in one compact top-right row', () => {
    const shared = source('src', 'components', 'ItineraryTimeline.shared.tsx');
    expect(shared).toContain('CategoryBadge category={item.category} compact={isMobile} inline');
    expect(shared).toContain('gap: 8 }');
    expect(shared).toContain('triggerRow: { position: \'absolute\'');
    expect(shared).toContain('categoryBadge: {');
    expect(shared).toContain("maxWidth: '100%'");
  });

  it('renders transport as an inline pill instead of a full-width block', () => {
    const shared = source('src', 'components', 'ItineraryTimeline.shared.tsx');
    expect(shared).toContain("transition: { alignSelf: 'flex-start'");
    expect(shared).toContain('width: \'auto\'');
    expect(shared).toContain('borderRadius: 999');
    expect(shared).toContain('line: { bottom: -30 }');
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
