import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { getCurrentProfile, PRESET_AVATARS, updateCurrentProfile, uploadProfileAvatar, type Profile } from '@/lib/profiles';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { ProfileAvatar } from './ProfileAvatar';

type PendingUpload = { fileName: string; fileType: string; data: ArrayBuffer; previewUri: string };

type Props = {
  visible: boolean;
  profile?: Profile | null;
  themeMode?: ThemeMode;
  onClose: () => void;
  onSaved: (profile: Profile) => void | Promise<void>;
};

export function UserProfileModal({ visible, profile, themeMode = 'system', onClose, onSaved }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(profile?.display_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? null);
    setPendingUpload(null);
  }, [visible, profile]);

  const previewProfile = useMemo<Profile>(() => ({
    id: profile?.id ?? '',
    display_name: displayName,
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    avatar_url: pendingUpload?.previewUri ?? avatarUrl,
    updated_at: profile?.updated_at ?? '',
  }), [avatarUrl, displayName, pendingUpload, profile]);

  async function chooseImage() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const file = result.assets[0];
      const fileType = file.mimeType ?? 'image/jpeg';
      const data = await (await fetch(file.uri)).arrayBuffer();
      setPendingUpload({ fileName: file.name, fileType, data, previewUri: file.uri });
      setAvatarUrl(null);
    } catch (error: any) {
      Alert.alert('選擇大頭照失敗', error?.message ?? '請重新選擇圖片。');
    }
  }

  async function save() {
    setBusy(true);
    try {
      const current = profile ?? await getCurrentProfile();
      if (!current) throw new Error('尚未登入，無法儲存個人檔案。');
      let nextAvatarUrl = avatarUrl;
      if (pendingUpload) {
        nextAvatarUrl = await uploadProfileAvatar({ userId: current.id, fileName: pendingUpload.fileName, fileType: pendingUpload.fileType, data: pendingUpload.data });
      }
      const saved = await updateCurrentProfile({ display_name: displayName, avatar_url: nextAvatarUrl });
      await onSaved(saved);
      onClose();
    } catch (error: any) {
      Alert.alert('儲存個人檔案失敗', error?.message ?? '請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}><Text style={[styles.title, { color: theme.colors.text }]}>個人檔案</Text><Pressable onPress={onClose} accessibilityRole="button"><Text style={[styles.close, { color: theme.colors.muted }]}>關閉</Text></Pressable></View>
      <View style={styles.preview}><ProfileAvatar profile={previewProfile} size={92} /><Text style={[styles.previewHint, { color: theme.colors.muted }]}>這是旅伴看見的名稱與頭像</Text></View>
      <Text style={[styles.label, { color: theme.colors.text }]}>自訂暱稱</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} placeholder="輸入旅伴容易辨識的名稱" placeholderTextColor={theme.colors.muted} maxLength={40} style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
      <Text style={[styles.label, { color: theme.colors.text }]}>選擇預設頭像</Text>
      <View style={styles.presets}>{PRESET_AVATARS.map((preset) => { const selected = avatarUrl === `preset:${preset.id}` && !pendingUpload; return <Pressable key={preset.id} accessibilityRole="button" accessibilityLabel={preset.label} style={[styles.presetButton, selected && { borderColor: theme.colors.primary, borderWidth: 2 }]} onPress={() => { setAvatarUrl(`preset:${preset.id}`); setPendingUpload(null); }}><ProfileAvatar profile={{ display_name: preset.label, avatar_url: `preset:${preset.id}` }} size={44} /></Pressable>; })}</View>
      <Pressable style={[styles.uploadButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={() => void chooseImage()} disabled={busy}><Text style={[styles.uploadText, { color: theme.colors.primary }]}>上傳自己的圖片</Text><Text style={[styles.uploadHint, { color: theme.colors.muted }]}>支援 JPG、PNG、WebP、GIF</Text></Pressable>
      <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={onClose} disabled={busy}><Text style={[styles.cancelText, { color: theme.colors.muted }]}>取消</Text></Pressable><Pressable style={[styles.saveButton, { backgroundColor: theme.colors.primary }]} onPress={() => void save()} disabled={busy}><Text style={styles.saveText}>{busy ? '儲存中…' : '儲存個人檔案'}</Text></Pressable></View>
    </ScrollView>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 14, paddingBottom: 44 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800' },
  close: { minHeight: 44, paddingVertical: 12, fontWeight: '700' },
  preview: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  previewHint: { fontSize: 12 },
  label: { fontWeight: '800', marginTop: 4 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 1, borderColor: 'transparent' },
  uploadButton: { minHeight: 62, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  uploadText: { fontWeight: '800' },
  uploadHint: { fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 8 },
  cancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10 },
  cancelText: { fontWeight: '700' },
  saveButton: { minHeight: 48, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 18 },
  saveText: { color: '#FFFDF8', fontWeight: '800' },
});
