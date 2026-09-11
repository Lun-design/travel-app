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
    zIndex: isDragging ? 20 : baseStyle.zIndex,
    // Route buttons and links must not receive pointer input while the card
    // is being dragged; the handle remains the sole active gesture target.
    pointerEvents: isDragging ? 'none' : baseStyle.pointerEvents,
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
    contain: 'paint',
    isolation: 'isolate',
  };
}

/** Touch dragging starts only after a deliberate long press and movement. */
export const MOBILE_DRAG_CONFIG = Object.freeze({
  activationDistance: 16,
  delayLongPress: 280,
  scrollEnabled: false,
});
