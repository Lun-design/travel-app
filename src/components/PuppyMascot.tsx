import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { ImageSourcePropType, ImageStyle, StyleProp } from 'react-native';
import type { PuppyId } from '@/lib/puppy';

const sources: Record<PuppyId, ImageSourcePropType> = {
  '-1': require('../assets/images/puppy/-1.gif'),
  '-2': require('../assets/images/puppy/-2.gif'),
  '-3': require('../assets/images/puppy/-3.gif'),
  '-4': require('../assets/images/puppy/-4.gif'),
  '-5': require('../assets/images/puppy/-5.gif'),
  '-6': require('../assets/images/puppy/-6.gif'),
  '-7': require('../assets/images/puppy/-7.gif'),
  '-8': require('../assets/images/puppy/-8.gif'),
  '-9': require('../assets/images/puppy/-9.gif'),
  '-10': require('../assets/images/puppy/-10.gif'),
  '-11': require('../assets/images/puppy/-11.gif'),
};

export function PuppyMascot({ puppy, size = 32, style, accessibilityLabel }: {
  puppy: PuppyId;
  size?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [opacity, puppy]);

  return <Animated.Image
    source={sources[puppy]}
    resizeMode="contain"
    accessible={Boolean(accessibilityLabel)}
    accessibilityLabel={accessibilityLabel}
    style={[{ width: size, height: size }, style, { opacity }]}
  />;
}

export const PuppyImage = PuppyMascot;
