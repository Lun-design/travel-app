import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  visible: boolean;
  departureTime: string | null | undefined;
  onClose: () => void;
  onSave: (defaultDepartureTime: string | null) => Promise<void>;
};

export function TripSettingsModal({ visible, departureTime, onClose, onSave }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(departureTime ?? '');
      setError('');
    }
  }, [departureTime, visible]);

  async function save() {
    const trimmed = value.trim();
    if (trimmed && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      setError('請使用 HH:mm 格式，例如 09:00。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed || null);
      onClose();
    } catch (cause: any) {
      console.error('[TripSettingsModal] save failed', cause);
      setError(cause?.message ?? '儲存行程設定失敗。');
    } finally {
      setSaving(false);
    }
  }

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>行程設定</Text>
        <Text style={styles.label}>預設每日出發時間</Text>
        <TextInput style={styles.input} value={value} onChangeText={setValue} placeholder="09:00" autoCapitalize="none" />
        <Text style={styles.helper}>若景點沒有填開始時間，會依此時間推算；留白時使用 09:00。</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={onClose}><Text style={styles.cancel}>取消</Text></Pressable>
          <Pressable style={styles.save} onPress={() => void save()} disabled={saving}><Text style={styles.white}>{saving ? '儲存中…' : '儲存設定'}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  card: { padding: 24, gap: 12, backgroundColor: 'white', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  label: { color: '#334155', fontWeight: '700', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 13, fontSize: 16 },
  helper: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 18, marginTop: 8 },
  cancel: { color: '#475569', fontWeight: '700' },
  save: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  white: { color: 'white', fontWeight: '800' },
});
