import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
const api = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn(), resend: vi.fn(), replace: vi.fn(), params: {} as { redirect?: string } }));
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useRef: (v: unknown) => a.default.useRef(v) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', ScrollView: 'section', KeyboardAvoidingView: 'keyboard-view', Platform: { OS: 'web' }, ActivityIndicator: 'loading', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: api.replace }), useLocalSearchParams: () => api.params }));
vi.mock('@/lib/auth-api', () => ({ signIn: api.signIn, signUp: api.signUp, resendConfirmation: api.resend, authErrorDetails: (error: unknown) => ({ message: error instanceof Error ? error.message : String(error), code: (error as { code?: string } | null)?.code }) }));
vi.mock('@/lib/auth', async () => import('../lib/auth'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
import LoginScreen from '../src/app/login';
let cleanup: (() => void) | undefined;
const success = () => ({ data: { session: { access_token: 'test-token' } }, error: null });
beforeEach(() => { api.params = {}; api.signIn.mockResolvedValue(success()); api.signUp.mockResolvedValue(success()); });
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
function setup() {
  const h = harness(() => LoginScreen()); cleanup = h.unmount; h.render();
  const input = (name: 'Email' | '密碼') => nodes(h.render()).find(n => n.type === 'input' && String(n.props.placeholder).startsWith(name))!;
  const button = (name: string) => nodes(h.render()).find(n => n.type === 'button' && text(n) === name)!;
  const fill = (email = 'traveler@example.com', password = 'password123') => { input('Email').props.onChangeText!(email); input('密碼').props.onChangeText!(password); };
  return { ...h, input, button, fill };
}
describe('login UX and safety', () => {
  it('keeps test-account hints and offers a default-hidden password toggle', () => {
    const h = setup(); h.fill();
    expect(text(h.render())).toContain('測試帳號範例'); expect(text(h.render())).toContain('traveler.test@example.com');
    expect(h.input('密碼').props.secureTextEntry).toBe(true);
    press(h.render(), '顯示密碼'); expect(h.input('密碼').props.secureTextEntry).toBe(false);
    press(h.render(), '隱藏密碼'); expect(h.input('密碼').props.secureTextEntry).toBe(true);
    expect(h.input('密碼').props.value).toBe('password123');
  });
  it('hides the password again on a mode change without losing the typed credentials', () => {
    const h = setup(); h.fill(); press(h.render(), '顯示密碼'); h.button('還沒有帳號？註冊').props.onPress!();
    expect(h.input('密碼').props.secureTextEntry).toBe(true); expect(h.input('Email').props.value).toBe('traveler@example.com');
    expect(api.signIn).not.toHaveBeenCalled(); expect(api.signUp).not.toHaveBeenCalled();
  });
  it.each([['   ', 'password123', '請輸入 Email'], ['no-email', 'password123', '有效的 Email'], ['a@example.com', '   ', '請輸入密碼']])('does not send invalid credentials (%s)', async (email, password, notice) => {
    const h = setup(); h.fill(email, password); await h.button('登入').props.onPress!();
    expect(api.signIn).not.toHaveBeenCalled(); expect(text(h.render())).toContain(notice);
  });
  it('applies the six-character minimum to registration only', async () => {
    const h = setup(); h.fill('a@example.com', 'abc'); h.button('還沒有帳號？註冊').props.onPress!();
    await h.button('註冊').props.onPress!(); expect(api.signUp).not.toHaveBeenCalled(); expect(text(h.render())).toContain('至少 6');
    h.button('已有帳號？登入').props.onPress!(); await h.button('登入').props.onPress!(); expect(api.signIn).toHaveBeenCalledWith('a@example.com', 'abc');
  });
  it('trims only the email, never the password, and preserves share-page redirect', async () => {
    api.params = { redirect: '/share/share-token?day=2' }; const h = setup(); h.fill('  a@example.com  ', ' pass word ');
    await h.button('登入').props.onPress!(); expect(api.signIn).toHaveBeenCalledWith('a@example.com', ' pass word ');
    expect(api.replace).toHaveBeenCalledWith('/share/share-token?day=2');
  });
  it('uses a synchronous submission lock even before React rerenders', async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    api.signIn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const h = setup(); h.fill(); const submit = h.button('登入').props.onPress!;
    const first = submit(); const second = submit(); expect(api.signIn).toHaveBeenCalledOnce();
    expect(h.button('處理中…').props.disabled).toBe(true);
    expect(h.button('還沒有帳號？註冊').props.disabled).toBe(true); expect(h.input('Email').props.editable).toBe(false);
    finish(success()); await first; await second; expect(api.replace).toHaveBeenCalledOnce();
  });
  it('blocks offline attempts before the API and permits a later retry', async () => {
    vi.stubGlobal('navigator', { onLine: false }); const h = setup(); h.fill(); await h.button('登入').props.onPress!();
    expect(api.signIn).not.toHaveBeenCalled(); expect(text(h.render())).toContain('離線');
    vi.stubGlobal('navigator', { onLine: true }); await h.button('登入').props.onPress!(); expect(api.signIn).toHaveBeenCalledOnce();
  });
  it('preserves credentials after failure and releases the lock for retry', async () => {
    api.signIn.mockRejectedValueOnce(new Error('Invalid login credentials')); const h = setup(); h.fill();
    await h.button('登入').props.onPress!(); expect(text(h.render())).toContain('Email 或密碼不正確');
    expect(h.input('密碼').props.value).toBe('password123'); expect(h.button('登入').props.disabled).toBe(false);
    await h.button('登入').props.onPress!(); expect(api.signIn).toHaveBeenCalledTimes(2);
  });
  it('explains a network failure without exposing deployment configuration advice', async () => {
    api.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch')); const h = setup(); h.fill();
    await h.button('登入').props.onPress!(); expect(text(h.render())).toContain('連線失敗，請檢查網路後再試');
    expect(text(h.render())).not.toContain('.env'); expect(h.button('登入').props.disabled).toBe(false);
  });
  it('explains a confirmation-policy mismatch without a resend-email action', async () => {
    api.signIn.mockResolvedValueOnce({ data: { session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    const h = setup(); h.fill(); await h.button('登入').props.onPress!();
    expect(text(h.render())).toContain('聯絡管理員確認帳號啟用設定'); expect(text(h.render())).not.toContain('驗證信'); expect(api.replace).not.toHaveBeenCalled();
  });
  it('registers directly with a server-issued session and keeps unsafe redirects on home', async () => {
    api.params = { redirect: 'https://other.example.com' }; const h = setup(); h.fill(); h.button('還沒有帳號？註冊').props.onPress!();
    await h.button('註冊').props.onPress!(); expect(api.signUp).toHaveBeenCalledOnce(); expect(api.replace).toHaveBeenCalledWith('/'); expect(api.resend).not.toHaveBeenCalled();
  });
  it('never fabricates login or requests confirmation email when signup returns no session', async () => {
    api.signUp.mockResolvedValueOnce({ data: { session: null, user: { id: 'u' } }, error: null });
    const h = setup(); h.fill(); h.button('還沒有帳號？註冊').props.onPress!(); await h.button('註冊').props.onPress!();
    expect(api.replace).not.toHaveBeenCalled(); expect(text(h.render())).toContain('未取得登入工作階段');
    expect(text(h.render())).not.toContain('驗證信'); expect(text(h.render())).not.toContain('驗證連結'); expect(api.resend).not.toHaveBeenCalled();
  });
  it('ignores a response completing after the login screen unmounts', async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    api.signIn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const h = setup(); h.fill(); const saving = h.button('登入').props.onPress!(); h.unmount(); cleanup = undefined;
    finish(success()); await saving; expect(api.replace).not.toHaveBeenCalled();
  });
});
