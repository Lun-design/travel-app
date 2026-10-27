import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Slots keep every original image/menu/action instance intact during reflow. */
export function TimelineCardLayout({ compact, image, heading, details }: { compact: boolean; image: React.ReactNode; heading: React.ReactNode; details: React.ReactNode }) {
  const picture = <View style={styles.picture}>{image}</View>;
  return compact ? <View style={styles.root}>
    <View testID="timeline-card-heading" style={styles.heading}>{picture}<View style={styles.copy}>{heading}</View></View>
    <View testID="timeline-card-details" style={styles.details}>{details}</View>
  </View> : <View style={styles.heading}>{picture}<View style={styles.copy}>{heading}{details}</View></View>;
}
const styles = StyleSheet.create({ root: { width: '100%', gap: 10 }, heading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, picture: { width: 64, height: 64, flexShrink: 0, position: 'relative' }, copy: { flex: 1, minWidth: 0, gap: 8 }, details: { width: '100%', minWidth: 0 } });
