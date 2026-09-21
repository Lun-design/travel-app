import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildTimeOptions, normalizeDateValue, normalizeTimeValue } from '@/lib/form-pickers';

export { buildTimeOptions, normalizeDateValue, normalizeTimeValue } from '@/lib/form-pickers';
export type PickerStyle = Record<string, unknown>;

type TimePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  style?: PickerStyle;
  testID?: string;
};

/**
 * Web uses the browser's native time wheel; native platforms get a compact
 * 15-minute selection sheet. Both paths emit normalized HH:mm values.
 */
export function TimePickerField({ value, onChange, placeholder = '09:00', label = '時間', disabled = false, style, testID }: TimePickerFieldProps) {
  const normalized = normalizeTimeValue(value);
  const [visible, setVisible] = useState(false);
  const options = useMemo(() => buildTimeOptions(15), []);

  if (Platform.OS === 'web') {
    return <input
      aria-label={label}
      data-testid={testID}
      disabled={disabled}
      type="time"
      value={normalized}
      onChange={(event) => onChange(normalizeTimeValue(event.currentTarget.value))}
      placeholder={placeholder}
      step={900}
      style={{ ...style, minHeight: 48, boxSizing: 'border-box' } as React.CSSProperties}
    />;
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      style={[styles.field, style, disabled && styles.disabled]}
      onPress={() => setVisible(true)}
    >
      <Text style={normalized ? styles.value : styles.placeholder}>{normalized || placeholder}</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <ScrollView style={styles.optionList} contentContainerStyle={styles.optionContent}>
            {options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === normalized }} style={[styles.option, option === normalized && styles.optionSelected]} onPress={() => { onChange(option); setVisible(false); }}><Text style={option === normalized ? styles.optionSelectedText : styles.optionText}>{option}</Text></Pressable>)}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  </>;
}

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  style?: PickerStyle;
  testID?: string;
};

function dateOptions(value: string): string[] {
  const selected = normalizeDateValue(value) || new Date().toISOString().slice(0, 10);
  const year = Number(selected.slice(0, 4));
  const start = new Date(Date.UTC(year - 1, 0, 1));
  const end = new Date(Date.UTC(year + 1, 11, 31));
  const options: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    options.push(cursor.toISOString().slice(0, 10));
  }
  return options;
}

/** Web date input plus a native calendar-like date selection sheet. */
export function DatePickerField({ value, onChange, placeholder = '2026-01-20', label = '日期', disabled = false, style, testID }: DatePickerFieldProps) {
  const normalized = normalizeDateValue(value);
  const [visible, setVisible] = useState(false);
  const options = useMemo(() => dateOptions(normalized), [normalized]);

  if (Platform.OS === 'web') {
    return <input
      aria-label={label}
      data-testid={testID}
      disabled={disabled}
      type="date"
      value={normalized}
      onChange={(event) => onChange(normalizeDateValue(event.currentTarget.value))}
      placeholder={placeholder}
      style={{ ...style, minHeight: 48, boxSizing: 'border-box' } as React.CSSProperties}
    />;
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      style={[styles.field, style, disabled && styles.disabled]}
      onPress={() => setVisible(true)}
    >
      <Text style={normalized ? styles.value : styles.placeholder}>{normalized || placeholder}</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{label}</Text>
          <ScrollView style={styles.optionList} contentContainerStyle={styles.optionContent}>
            {options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === normalized }} style={[styles.option, option === normalized && styles.optionSelected]} onPress={() => { onChange(option); setVisible(false); }}><Text style={option === normalized ? styles.optionSelectedText : styles.optionText}>{option}</Text></Pressable>)}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  field: { minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#E5E2D9', borderRadius: 10, paddingHorizontal: 13, backgroundColor: '#FFFFFF' },
  value: { color: '#1F1F1F', fontSize: 15 },
  placeholder: { color: '#8E8E93', fontSize: 15 },
  disabled: { opacity: 0.55 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31,31,31,0.35)' },
  sheet: { maxHeight: '75%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20 },
  sheetTitle: { color: '#1F1F1F', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  optionList: { maxHeight: 420 },
  optionContent: { gap: 6, paddingBottom: 20 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F7F5F0' },
  optionSelected: { backgroundColor: '#8C6D58' },
  optionText: { color: '#1F1F1F', fontSize: 16 },
  optionSelectedText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
