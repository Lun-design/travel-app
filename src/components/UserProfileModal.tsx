import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { getCurrentProfile, PRESET_AVATARS, updateCurrentProfile, uploadProfileAvatar, type Profile } from '@/lib/profiles';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { ProfileAvatar } from './ProfileAvatar';
import { FormModalLayout } from './FormModalLayout';

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
  const [picking, setPicking] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');
  const editSession = useRef<{ id: string | null } | null>(null);
  const baseline = useRef({ displayName: '', avatarUrl: null as string | null });
  const saveLock = useRef(false);
  const imageRequest = useRef<{ controller: AbortController } | null>(null);
  const controlsDisabled = busy || picking || confirmClose;

  useEffect(() => {
    if (!visible) { editSession.current = null; imageRequest.current?.controller.abort(); imageRequest.current = null; return; }
    // Returning from the OS file picker triggers a focus refresh. A replacement
    // object for the same account must not erase this open editor's draft.
    const id = profile?.id ?? null;
    if (editSession.current && editSession.current.id === id) return;
    imageRequest.current?.controller.abort(); imageRequest.current = null;
    editSession.current = { id };
    baseline.current = { displayName: profile?.display_name ?? '', avatarUrl: profile?.avatar_url ?? null };
    saveLock.current = false;
    setBusy(false); setPicking(false); setConfirmClose(false); setError('');
    setDisplayName(profile?.display_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? null);
    setPendingUpload(null);
  }, [visible, profile]);

  useEffect(() => () => { editSession.current = null; imageRequest.current?.controller.abort(); imageRequest.current = null; }, []);

  function cancelImageSelection() {
    imageRequest.current?.controller.abort();
    imageRequest.current = null;
    setPicking(false);
  }

  function discardAndClose() {
    if (saveLock.current) return;
    cancelImageSelection();
    setPendingUpload(null);
    setDisplayName(baseline.current.displayName); setAvatarUrl(baseline.current.avatarUrl);
    setConfirmClose(false);
    editSession.current = null;
    onClose();
  }

  function requestClose() {
    if (saveLock.current) return;
    if (confirmClose) { setConfirmClose(false); return; }
    cancelImageSelection();
    if (pendingUpload || displayName !== baseline.current.displayName || avatarUrl !== baseline.current.avatarUrl) setConfirmClose(true);
    else discardAndClose();
  }

  const previewProfile = useMemo<Profile>(() => ({
    id: profile?.id ?? '',
    display_name: displayName,
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    avatar_url: pendingUpload?.previewUri ?? avatarUrl,
    updated_at: profile?.updated_at ?? '',
  }), [avatarUrl, displayName, pendingUpload, profile]);

  async function chooseImage() {
    if (!visible || !editSession.current || saveLock.current || imageRequest.current || confirmClose) return;
    const session = editSession.current;
    const request = { controller: new AbortController() };
    imageRequest.current = request;
    setPicking(true); setError('');
    const active = () => editSession.current === session && imageRequest.current === request;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      if (!active() || result.canceled) return;
      const file = result.assets[0];
      if (!file?.uri) throw new Error('未取得圖片，請重新選擇。');
      const fileType = file.mimeType ?? 'image/jpeg';
      const response = await fetch(file.uri, { signal: request.controller.signal });
      if (!active()) return;
      if (!response.ok) throw new Error('無法讀取圖片，請重新選擇。');
      const data = await response.arrayBuffer();
      if (!active()) return;
      setPendingUpload({ fileName: file.name, fileType, data, previewUri: file.uri });
      setAvatarUrl(null);
    } catch (cause: unknown) {
      if (!active()) return;
      const message = cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : '請重新選擇圖片。';
      setError(message); Alert.alert('選擇大頭照失敗', message);
    } finally {
      if (active()) { imageRequest.current = null; setPicking(false); }
    }
  }

  async function save() {
    if (!visible || !editSession.current || saveLock.current || imageRequest.current || confirmClose) return;
    const session = editSession.current;
    saveLock.current = true;
    setBusy(true);
    setError('');
    try {
      const current = profile ?? await getCurrentProfile();
      if (editSession.current !== session) return;
      if (!current) throw new Error('尚未登入，無法儲存個人檔案。');
      let nextAvatarUrl = avatarUrl;
      if (pendingUpload) {
        nextAvatarUrl = await uploadProfileAvatar({ userId: current.id, fileName: pendingUpload.fileName, fileType: pendingUpload.fileType, data: pendingUpload.data });
        if (editSession.current !== session) return;
      }
      const saved = await updateCurrentProfile({ display_name: displayName, avatar_url: nextAvatarUrl }, current.id);
      if (editSession.current !== session) return;
      await onSaved(saved);
      if (editSession.current !== session) return;
      baseline.current = { displayName: saved.display_name ?? '', avatarUrl: saved.avatar_url };
      setDisplayName(baseline.current.displayName); setAvatarUrl(saved.avatar_url); setPendingUpload(null);
      onClose();
    } catch (cause: unknown) {
      if (editSession.current !== session) return;
      const message = cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : '請稍後再試。';
      setError(message); Alert.alert('儲存個人檔案失敗', message);
    } finally {
      if (editSession.current === session) { saveLock.current = false; setBusy(false); }
    }
  }

  const footer = <View style={styles.footer}>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>{error}</Text> : null}
    {confirmClose ? <View style={[styles.confirmation, { backgroundColor: theme.colors.surfaceMuted }]}>
      <Text accessibilityRole="alert" style={[styles.label, { color: theme.colors.text }]}>尚有未儲存的變更</Text>
      <Text style={{ color: theme.colors.muted }}>放棄暱稱與頭像的修改？尚未儲存的照片不會保留。</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="繼續編輯" style={styles.cancelButton} onPress={() => setConfirmClose(false)}><Text style={{ color: theme.colors.text }}>繼續編輯</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="放棄修改" style={styles.cancelButton} onPress={discardAndClose}><Text style={{ color: theme.colors.primary }}>放棄修改</Text></Pressable>
      </View>
    </View> : <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="取消" style={styles.cancelButton} onPress={requestClose} disabled={busy}><Text style={[styles.cancelText, { color: theme.colors.muted }]}>取消</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="儲存個人檔案" accessibilityState={{ disabled: controlsDisabled, busy }} style={[styles.saveButton, { backgroundColor: theme.colors.primary }]} onPress={() => void save()} disabled={controlsDisabled}><Text style={styles.saveText}>{busy ? '儲存中…' : '儲存個人檔案'}</Text></Pressable></View>}
  </View>;

  return <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
    <FormModalLayout backgroundColor={theme.colors.background} blocked={busy || confirmClose} footer={footer}>
      <View style={styles.header}><Text style={[styles.title, { color: theme.colors.text }]}>個人檔案</Text><Pressable onPress={requestClose} accessibilityRole="button" accessibilityLabel="關閉" disabled={busy}><Text style={[styles.close, { color: theme.colors.muted }]}>關閉</Text></Pressable></View>
      <View style={styles.preview}><ProfileAvatar profile={previewProfile} size={92} /><Text style={[styles.previewHint, { color: theme.colors.muted }]}>這是旅伴看見的名稱與頭像</Text></View>
      <Text style={[styles.label, { color: theme.colors.text }]}>自訂暱稱</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} editable={!controlsDisabled} placeholder="輸入旅伴容易辨識的名稱" placeholderTextColor={theme.colors.muted} maxLength={40} style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
      <Text style={[styles.label, { color: theme.colors.text }]}>選擇預設頭像</Text>
      <View style={styles.presets}>{PRESET_AVATARS.map((preset) => { const selected = avatarUrl === `preset:${preset.id}` && !pendingUpload; return <Pressable key={preset.id} accessibilityRole="button" accessibilityLabel={preset.label} disabled={controlsDisabled} accessibilityState={{ selected, disabled: controlsDisabled }} style={[styles.presetButton, selected && { borderColor: theme.colors.primary, borderWidth: 2 }]} onPress={() => { if (saveLock.current || imageRequest.current || confirmClose) return; setAvatarUrl(`preset:${preset.id}`); setPendingUpload(null); }}><ProfileAvatar profile={{ display_name: preset.label, avatar_url: `preset:${preset.id}` }} size={44} /></Pressable>; })}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="上傳自己的圖片" accessibilityState={{ disabled: controlsDisabled, busy: picking }} style={[styles.uploadButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={() => void chooseImage()} disabled={controlsDisabled}><Text style={[styles.uploadText, { color: theme.colors.primary }]}>{picking ? '正在選擇圖片…' : '上傳自己的圖片'}</Text><Text style={[styles.uploadHint, { color: theme.colors.muted }]}>支援 JPG、PNG、WebP、GIF</Text></Pressable>
      {picking ? <Pressable accessibilityRole="button" accessibilityLabel="取消選圖" style={styles.cancelButton} onPress={cancelImageSelection}><Text style={{ color: theme.colors.primary }}>取消選圖</Text></Pressable> : null}
    </FormModalLayout>
  </Modal>;
}

const styles = StyleSheet.create({
  confirmation: { padding: 12, gap: 8, borderRadius: 12 },
  footer: { gap: 8 },
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
