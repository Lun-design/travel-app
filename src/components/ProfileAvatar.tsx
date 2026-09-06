import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getPresetAvatar, getProfileDisplayName, getProfileInitial, type ProfileLike } from '@/lib/profiles';
import { EDITORIAL_COLORS } from '@/lib/theme';

type Props = {
  profile?: ProfileLike | null;
  userId?: string;
  size?: number;
  accessibilityLabel?: string;
};

export function ProfileAvatar({ profile, userId, size = 36, accessibilityLabel }: Props) {
  const preset = getPresetAvatar(profile?.avatar_url);
  const label = accessibilityLabel ?? getProfileDisplayName(profile, userId || '旅伴');
  const radius = size / 2;
  const baseStyle = { width: size, height: size, borderRadius: radius };

  if (preset) {
    return <View accessibilityLabel={label} style={[styles.avatar, baseStyle, { backgroundColor: preset.backgroundColor }]}><Text style={[styles.presetMark, { fontSize: Math.max(14, size * 0.42) }]}>{preset.emoji}</Text></View>;
  }

  if (profile?.avatar_url) {
    return <Image accessibilityLabel={label} source={{ uri: profile.avatar_url }} resizeMode="cover" style={[styles.avatar, baseStyle]} />;
  }

  return <View accessibilityLabel={label} style={[styles.avatar, baseStyle, styles.initialAvatar]}><Text style={[styles.initial, { fontSize: Math.max(13, size * 0.38) }]}>{getProfileInitial(profile, userId || '旅')}</Text></View>;
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  presetMark: { color: EDITORIAL_COLORS.charcoal, fontWeight: '800' },
  initialAvatar: { backgroundColor: EDITORIAL_COLORS.sand },
  initial: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800' },
});
