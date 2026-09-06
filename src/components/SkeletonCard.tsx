import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { EDITORIAL_COLORS } from '@/lib/theme';

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
  card: { width: '100%', minHeight: 118, borderRadius: 12, padding: 18, gap: 12, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  timeline: { minHeight: 140 },
  map: { minHeight: 240, borderRadius: 18 },
  header: { minHeight: 90, borderRadius: 14 },
  lineShort: { width: '32%', height: 14, borderRadius: 5, backgroundColor: '#D9D3C7' },
  lineLong: { width: '82%', height: 18, borderRadius: 5, backgroundColor: '#D9D3C7' },
  lineMedium: { width: '58%', height: 13, borderRadius: 5, backgroundColor: '#D9D3C7' },
});
