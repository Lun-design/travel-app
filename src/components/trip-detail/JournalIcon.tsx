import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Font-independent, decorative line controls; the parent owns label and hit area. */
export function JournalIcon({ name, color }: { name: 'back' | 'search' | 'more' | 'close'; color: string }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
    {name === 'search' ? <><View style={[styles.lens, { borderColor: color }]} /><View style={[styles.handle, { backgroundColor: color }]} /></> : null}
    {name === 'back' ? <View style={[styles.chevron, { borderColor: color }]} /> : null}
    {name === 'more' ? <View style={styles.dots}>{[0, 1, 2].map(key => <View key={key} style={[styles.dot, { backgroundColor: color }]} />)}</View> : null}
    {name === 'close' ? <><View style={[styles.slash, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} /><View style={[styles.slash, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} /></> : null}
  </View>;
}
const styles = StyleSheet.create({
  frame: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  lens: { position: 'absolute', width: 13, height: 13, borderRadius: 7, borderWidth: 1.7, left: 2, top: 2 },
  handle: { position: 'absolute', width: 8, height: 1.7, borderRadius: 1, transform: [{ rotate: '45deg' }], left: 12, top: 16 },
  chevron: { width: 10, height: 10, borderLeftWidth: 1.7, borderBottomWidth: 1.7, transform: [{ rotate: '45deg' }], marginLeft: 4 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 3, height: 3, borderRadius: 2 },
  slash: { position: 'absolute', width: 18, height: 1.7, borderRadius: 1 },
});
