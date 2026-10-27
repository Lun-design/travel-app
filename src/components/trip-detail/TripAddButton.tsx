import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

export function TripAddButton({ compact, onPress, style, textColor, fontSize = 14 }: { compact: boolean; onPress: () => void; style?: StyleProp<ViewStyle>; textColor: string; fontSize?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="新增景點／活動" style={[style, styles.base, compact && styles.compact]} onPress={onPress}>
    <Text numberOfLines={1} style={{ color: textColor, fontSize: compact ? 26 : fontSize, fontWeight: '700' }}>{compact ? '＋' : '＋ 新增景點／活動'}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({ base: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, compact: { width: 48, height: 48, minHeight: 48, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 24 } });
