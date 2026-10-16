import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
/** Fields scroll independently; actions remain reachable above keyboard and safe-area. */
export function FormModalLayout({ children, footer, notice, blocked = false, contentStyle, backgroundColor = '#FFFDF8' }: { children: React.ReactNode; footer: React.ReactNode; notice?: React.ReactNode; blocked?: boolean; contentStyle?: StyleProp<ViewStyle>; backgroundColor?: string }) {
  const insets = useSafeAreaInsets();
  const [keyboardGap, setKeyboardGap] = useState(0);
  useEffect(() => { if (blocked) { Keyboard.dismiss(); if (Platform.OS === 'web' && typeof document !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.(); } }, [blocked]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setKeyboardGap(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    update(); viewport.addEventListener('resize', update); viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, []);
  return <KeyboardAvoidingView style={[styles.root, { backgroundColor, paddingBottom: keyboardGap }]} enabled={Platform.OS !== 'web'} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={styles.scroll} contentContainerStyle={[styles.content, contentStyle, { paddingTop: Math.max(24, insets.top + 12) }]}>{notice}{Platform.OS === 'web' ? <div inert={blocked || undefined} style={{ pointerEvents: blocked ? 'none' : 'auto', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}><fieldset disabled={blocked} style={{ display: 'flex', flexDirection: 'column', gap: 12, border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset></div> : <View pointerEvents={blocked ? 'none' : 'auto'} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'} style={{ gap: 12 }}>{children}</View>}</ScrollView>
    <View testID="form-fixed-footer" style={[styles.footer, { backgroundColor, paddingBottom: Math.max(12, insets.bottom), paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>{footer}</View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ root: { flex: 1, minHeight: 0, width: '100%' }, scroll: { flex: 1, minHeight: 0 }, content: { padding: 24, paddingBottom: 24, gap: 12 }, footer: { flexShrink: 0, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E2D9' } });
