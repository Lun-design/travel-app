/** Shared safeguards for the web and native itinerary drag interactions. */
import type { CSSProperties } from 'react';

/**
 * Keep the dragged card's layout dimensions stable.  DnD libraries move the
 * active node out of normal flow; explicit width/box sizing prevents its
 * flex children (route controls and actions) from collapsing or wrapping
 * into an unusable preview.
 */
export function createDragPreviewStyle(baseStyle: CSSProperties = {}, isDragging = false): CSSProperties {
  return {
    ...baseStyle,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    // Keep the compositor on the transform path while the DnD library moves
    // the card.  This avoids repeatedly repainting its text and controls.
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    // Keep a reliable visible source while the optional clone/portal mounts.
    // Hiding the source creates a blank frame (or a permanently blank drag if
    // the portal is unavailable in an embedded WebView).
    opacity: isDragging ? 1 : baseStyle.opacity,
    visibility: isDragging ? 'visible' : baseStyle.visibility,
    zIndex: isDragging ? 20 : baseStyle.zIndex,
    // Route buttons and links must not receive pointer input while the card
    // is being dragged; the handle remains the sole active gesture target.
    pointerEvents: isDragging ? 'none' : baseStyle.pointerEvents,
  };
}

/**
 * Style for the Web drag overlay. It deliberately uses a small, fixed-flow
 * surface so long-distance pointer moves do not force the full card subtree to
 * participate in layout/repaint on every frame.
 */
export function createDragCloneStyle(baseStyle: CSSProperties = {}): CSSProperties {
  return {
    ...baseStyle,
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
    boxSizing: 'border-box',
  };
}

/**
 * Establish a clipping/stacking boundary around the timeline.  This keeps a
 * browser drag preview from painting over the map or floating actions while
 * preserving the list's natural height after the drop placeholder is gone.
 */
export function createDragContainerStyle(): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    height: 'auto',
    contain: 'paint',
    isolation: 'isolate',
  };
}

/** Keep the native cell measurable while an Animated.View translates it. */
export function createNativeDragRowStyle() {
  return {
    width: '100%' as const,
    maxWidth: '100%' as const,
    overflow: 'visible' as const,
  };
}

/** Keep the card body, route connector and action row in one flow context. */
export function createTimelineCardContainerStyle() {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    height: 'auto',
    boxSizing: 'border-box',
  } as const;
}

/** Touch dragging starts only after a deliberate long press and movement. */
export const MOBILE_DRAG_CONFIG = Object.freeze({
  activationDistance: 16,
  delayLongPress: 280,
  scrollEnabled: false,
  removeClippedSubviews: false,
  dragItemOverflow: false,
  // A responsive, critically damped spring reduces the visible snap/settle
  // work when neighbouring rows make room for the active card.
  animationConfig: Object.freeze({
    damping: 24,
    mass: 0.18,
    stiffness: 180,
    overshootClamping: true,
    restSpeedThreshold: 0.35,
    restDisplacementThreshold: 0.35,
  }),
});

/** Pressable tuning prevents a tiny finger drift from cancelling long press. */
export const MOBILE_GRIP_CONFIG = Object.freeze({
  delayLongPress: 280,
  pressRetentionOffset: 24,
  hitSlop: 4,
});

const timelineItemFields = [
  'id', 'location_name', 'address', 'latitude', 'longitude', 'category',
  'notes', 'time', 'start_time', 'duration_minutes', 'position', 'day_number',
] as const;

function sameTimelineItem(left: { [key: string]: any }, right: { [key: string]: any }) {
  return timelineItemFields.every((field) => left[field] === right[field]);
}

/**
 * Comparator used by React.memo. Parent refreshes commonly create new item
 * objects even though their rendered fields are unchanged; skipping those
 * renders keeps drag frames focused on the active row.
 */
export function areTimelineCardPropsEqual(previous: any, next: any) {
  return sameTimelineItem(previous.item, next.item)
    && previous.segment === next.segment
    && previous.scheduled === next.scheduled
    && previous.weather === next.weather
    && previous.active === next.active
    && previous.themeMode === next.themeMode
    && previous.vouchers === next.vouchers
    && previous.onPreviewVoucher === next.onPreviewVoucher
    && previous.onEdit === next.onEdit
    && previous.onDelete === next.onDelete
    && previous.onMoveUp === next.onMoveUp
    && previous.onMoveDown === next.onMoveDown
    && previous.canMoveUp === next.canMoveUp
    && previous.canMoveDown === next.canMoveDown
    && previous.onRouteModeChange === next.onRouteModeChange;
}

/**
 * Reconcile a parent refresh without erasing an in-progress/just-completed
 * local reorder.  A parent mutation often returns the same IDs in database
 * order; preserving the current sequence prevents the native list from
 * snapping back while still accepting refreshed item fields.
 */
export function reconcileDraggedItems<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
  sortIncoming: (items: T[]) => T[] = (items) => items,
): T[] {
  if (current.length === incoming.length && current.every((item) => incoming.some((entry) => entry.id === item.id))) {
    const incomingById = new Map(incoming.map((item) => [item.id, item]));
    return current.map((item) => incomingById.get(item.id) ?? item);
  }
  return sortIncoming([...incoming]);
}
