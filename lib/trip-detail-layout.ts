const COMPACT_BREAKPOINT = 480;

export function getTripDetailLayout(width: number) {
  const compact = width <= COMPACT_BREAKPOINT;

  return {
    compact,
    screenPaddingHorizontal: compact ? 12 : 22,
    screenPaddingTop: compact ? 18 : 30,
    panePadding: compact ? 12 : 16,
    mapMinHeight: compact ? 240 : 280,
    fabRight: compact ? 12 : 34,
    fabBottom: compact ? 12 : 24,
    fabPaddingHorizontal: compact ? 12 : 18,
    fabPaddingVertical: compact ? 10 : 14,
    fabFontSize: compact ? 13 : 14,
    fabMaxWidth: Math.max(0, width - (compact ? 24 : 68)),
  };
}
