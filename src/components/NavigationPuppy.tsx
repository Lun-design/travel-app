import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PuppyMascot } from '@/components/PuppyMascot';

/** Reading a route is meaningful for every category; this GIF is truly transparent.
 * Crop only the original transparent margins, without altering animation bytes.
 */
export function NavigationPuppy() {
  return <View testID="navigation-puppy-crop" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.crop}>
    <PuppyMascot puppy="journal-reading" size={43} style={styles.image} />
  </View>;
}
const styles = StyleSheet.create({ crop: { width: 28, height: 28, flexShrink: 0, overflow: 'hidden', backgroundColor: 'transparent', opacity: 1 }, image: { position: 'absolute', left: -8, top: -9 } });
