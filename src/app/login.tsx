import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { friendlyAuthError } from '@/lib/auth';
import { authErrorDetails, resendConfirmation, signIn, signUp } from '@/lib/auth-api';

export default function LoginScreen() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = register ? await signUp(email.trim(), password) : await signIn(email.trim(), password);
      if (result.error) throw result.error;
      if (result.data.session) router.replace('/');
      else setMessage('請至信箱點擊驗證連結，再回來登入。');
    } catch (e) {
      console.error('[LoginScreen] submit failed', authErrorDetails(e));
      setError(friendlyAuthError(e));
    } finally { setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setError('');
    try {
      const result = await resendConfirmation(email.trim());
      if (result.error) throw result.error;
      setMessage('驗證信已重新寄出，請檢查信箱。');
    } catch (e) {
      console.error('[LoginScreen] resend confirmation failed', authErrorDetails(e));
      setError(friendlyAuthError(e));
    } finally { setBusy(false); }
  };

  return <View style={styles.container}>
    <Text style={styles.title}>{register ? '建立帳號' : '登入行程規劃'}</Text>
    <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} />
    <TextInput style={styles.input} secureTextEntry placeholder="密碼（至少 6 個字元）" value={password} onChangeText={setPassword} />
    <Pressable style={styles.button} onPress={submit} disabled={busy}><Text style={styles.buttonText}>{busy ? '處理中…' : register ? '註冊' : '登入'}</Text></Pressable>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {message && register ? <Pressable onPress={resend}><Text style={styles.link}>重新發送驗證信</Text></Pressable> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable onPress={() => { setRegister(!register); setMessage(''); setError(''); }}><Text style={styles.link}>{register ? '已有帳號？登入' : '還沒有帳號？註冊'}</Text></Pressable>
    <View style={styles.hint}><Text>測試帳號範例</Text><Text>traveler.test@example.com</Text><Text>TravelTest123!</Text><Text style={styles.small}>若已註冊，請改用登入或換其他唯一 Email。</Text></View>
    {busy ? <ActivityIndicator /> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', padding: 28, gap: 14, backgroundColor: '#f8fafc' }, title: { fontSize: 28, fontWeight: '700', marginBottom: 8 }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 14 }, button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 15, alignItems: 'center' }, buttonText: { color: 'white', fontWeight: '700' }, message: { color: '#166534' }, error: { color: '#b91c1c' }, link: { color: '#2563eb', textAlign: 'center' }, hint: { marginTop: 16, padding: 14, backgroundColor: '#e0f2fe', borderRadius: 10, gap: 3 }, small: { color: '#475569', fontSize: 12 } });
