import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { friendlyAuthError } from '@/lib/auth';
import { authErrorDetails, signIn, signUp } from '@/lib/auth-api';
import { EDITORIAL_COLORS } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { redirect: rawRedirect } = useLocalSearchParams<{ redirect?: string }>();
  const redirect = typeof rawRedirect === 'string' && rawRedirect.startsWith('/share/') ? rawRedirect : '/';
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const submit = async () => {
    if (submitting.current || !mounted.current) return;
    const address = email.trim();
    setError(''); setMessage('');
    if (!address) { setError('請輸入 Email。'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('請輸入有效的 Email。'); return; }
    if (!password.trim()) { setError('請輸入密碼。'); return; }
    if (register && password.length < 6) { setError('註冊密碼至少 6 個字元。'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setError('目前處於離線狀態，請連線後再試。'); return; }
    submitting.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = register ? await signUp(address, password) : await signIn(address, password);
      if (!mounted.current) return;
      if (result.error) throw result.error;
      if (result.data.session) router.replace(redirect as any);
      else setMessage('目前未取得登入工作階段，請聯絡管理員確認註冊設定，或返回登入再試。');
    } catch (e) {
      if (!mounted.current) return;
      console.error('[LoginScreen] submit failed', authErrorDetails(e));
      const details = authErrorDetails(e);
      setError(details.code === 'email_not_confirmed' ? '目前無法登入，請聯絡管理員確認帳號啟用設定。' : /failed to fetch|network request failed|network error/i.test(details.message) ? '連線失敗，請檢查網路後再試。' : friendlyAuthError(e));
    } finally { submitting.current = false; if (mounted.current) setBusy(false); }
  };

  function toggleMode() {
    if (submitting.current) return;
    setRegister(value => !value); setShowPassword(false); setMessage(''); setError('');
  }

  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{register ? '建立帳號' : '登入行程規劃'}</Text>
    <TextInput style={styles.input} accessibilityLabel="Email" editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="Email" value={email} onChangeText={setEmail} />
    <View style={styles.passwordRow}>
      <TextInput style={[styles.input, styles.passwordInput]} accessibilityLabel="密碼" editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={register ? 'new-password' : 'current-password'} textContentType={register ? 'newPassword' : 'password'} returnKeyType="done" onSubmitEditing={() => void submit()} placeholder={register ? '密碼（至少 6 個字元）' : '密碼'} value={password} onChangeText={setPassword} />
      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? '隱藏密碼' : '顯示密碼'} accessibilityState={{ disabled: busy }} style={styles.passwordToggle} disabled={busy} onPress={() => { if (!submitting.current) setShowPassword(value => !value); }}><Text style={styles.toggleText}>{showPassword ? '隱藏' : '顯示'}</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={register ? '註冊' : '登入'} accessibilityState={{ disabled: busy, busy }} style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.buttonText}>{busy ? '處理中…' : register ? '註冊' : '登入'}</Text></Pressable>
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={toggleMode}><Text style={styles.link}>{register ? '已有帳號？登入' : '還沒有帳號？註冊'}</Text></Pressable>
    <View style={styles.hint}><Text>測試帳號範例</Text><Text>traveler.test@example.com</Text><Text>TravelTest123!</Text><Text style={styles.small}>若已註冊，請改用登入或換其他唯一 Email。</Text></View>
    {busy ? <ActivityIndicator /> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: EDITORIAL_COLORS.oat }, content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14 }, passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, passwordInput: { flex: 1, minWidth: 0 }, passwordToggle: { minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracottaSoft }, toggleText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' }, disabled: { opacity: 0.6 }, title: { fontSize: 30, lineHeight: 38, letterSpacing: -0.4, color: EDITORIAL_COLORS.charcoal, fontWeight: '800', marginBottom: 8 }, input: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, minHeight: 48, padding: 14, color: EDITORIAL_COLORS.charcoal }, button: { backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: EDITORIAL_COLORS.paper, fontWeight: '700' }, message: { color: '#55705A' }, error: { color: EDITORIAL_COLORS.dangerText }, link: { color: EDITORIAL_COLORS.terracotta, textAlign: 'center', minHeight: 44, paddingVertical: 12 }, hint: { marginTop: 16, padding: 14, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderRadius: 10, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, gap: 3 }, small: { color: EDITORIAL_COLORS.taupe, fontSize: 12 } });
