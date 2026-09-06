import React from 'react';
import { View } from 'react-native';

/** Content grows inside the page scroll; never compete with the map for leftover height. */
export function TimelineViewport({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return <View testID="timeline-viewport" style={{
    width: '100%', flexGrow: 1, flexShrink: 0, flexBasis: 'auto',
    minHeight: width >= 768 ? Math.max(320, Math.round(height / 2)) : 0,
    paddingTop: 12, paddingBottom: 100,
  }}>{children}</View>;
}
