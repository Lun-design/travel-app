import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

export type SkeletonCardVariant = 'timeline' | 'map' | 'header';

export function SkeletonCard({ variant = 'timeline' }: { variant?: SkeletonCardVariant }) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.95, duration: 650, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View accessibilityLabel="載入中" style={[styles.card, styles[variant], { opacity }]}>
    <View style={styles.lineShort} />
    <View style={styles.lineLong} />
    <View style={styles.lineMedium} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', minHeight: 118, borderRadius: 16, padding: 18, gap: 12, backgroundColor: '#e2e8f0' },
  timeline: { minHeight: 140 },
  map: { minHeight: 240, borderRadius: 18 },
  header: { minHeight: 90, borderRadius: 14 },
  lineShort: { width: '32%', height: 14, borderRadius: 7, backgroundColor: '#cbd5e1' },
  lineLong: { width: '82%', height: 18, borderRadius: 9, backgroundColor: '#cbd5e1' },
  lineMedium: { width: '58%', height: 13, borderRadius: 7, backgroundColor: '#cbd5e1' },
});

