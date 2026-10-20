import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Profile } from '../lib/profiles';
const mocks = vi.hoisted(() => ({ pick: vi.fn(), upload: vi.fn(), save: vi.fn(), current: vi.fn(), alert: vi.fn() }));
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useRef: (v: unknown) => a.default.useRef(v), useMemo: (...p: Parameters<typeof React.useMemo>) => a.default.useMemo(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', Modal: 'modal', ScrollView: 'section', Alert: { alert: mocks.alert }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.pick }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/profiles', async () => ({ ...await import('../lib/profiles'), getCurrentProfile: mocks.current, updateCurrentProfile: mocks.save, uploadProfileAvatar: mocks.upload }));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('../src/components/FormModalLayout', () => ({ FormModalLayout: 'form-layout' }));
import { UserProfileModal } from '../src/components/UserProfileModal';
const profile: Profile = { id: 'u', display_name: '旅伴', avatar_url: 'preset:cream', updated_at: 'now' };
const picked = { canceled: false, assets: [{ name: 'avatar.gif', mimeType: 'image/gif', uri: 'blob:avatar' }] };
let cleanup: (() => void) | undefined;
beforeEach(() => {
  mocks.pick.mockResolvedValue(picked); mocks.current.mockResolvedValue(profile); mocks.upload.mockResolvedValue('https://example.test/new.gif'); mocks.save.mockImplementation(async changes => ({ ...profile, ...changes }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) })));
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });
function setup() {
  let props: React.ComponentProps<typeof UserProfileModal> = { visible: true, profile, onClose: vi.fn(), onSaved: vi.fn() };
  const h = harness(() => UserProfileModal(props)); cleanup = h.unmount; h.render();
  return { h, get props() { return props; }, set(next: Partial<typeof props>) { props = { ...props, ...next }; h.render(); } };
}
function button(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.type === 'button' && (n.props.accessibilityLabel === label || text(n) === label || (label === '上傳自己的圖片' && text(n).startsWith(label)))); }
function click(tree: React.ReactNode, label: string) { const b = button(tree, label); expect(b, label).toBeDefined(); if (!b!.props.disabled) return b!.props.onPress!(); }
function name(tree: React.ReactNode) { return nodes(tree).find(n => n.type === 'input')!; }
function preview(tree: React.ReactNode) { return nodes(tree).find(n => n.props.size === 92)!.props.profile as Profile; }
function back(tree: React.ReactNode) { (nodes(tree).find(n => n.type === 'modal')!.props.onRequestClose as () => void)(); }
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
async function pick(s: ReturnType<typeof setup>) { click(s.h.render(), '上傳自己的圖片'); await flush(); expect(preview(s.h.render()).avatar_url).toBe('blob:avatar'); }
describe('profile unsaved protection', () => {
  it('unchanged profile closes without prompting or writes', () => {
    const s = setup(); click(s.h.render(), '關閉'); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['關閉', '取消', '返回'])('changed nickname is protected through %s', action => {
    const s = setup(); name(s.h.render()).props.onChangeText!('新暱稱'); if (action === '返回') back(s.h.render()); else click(s.h.render(), action);
    expect(s.props.onClose).not.toHaveBeenCalled(); expect(button(s.h.render(), '放棄修改')).toBeDefined();
    click(s.h.render(), '繼續編輯'); expect(name(s.h.render()).props.value).toBe('新暱稱');
  });
  it('preset change requires confirmation and discard never writes', () => {
    const s = setup(); click(s.h.render(), '鼠尾草'); click(s.h.render(), '取消'); click(s.h.render(), '放棄修改');
    expect(s.props.onClose).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('keeps the confirmation actions outside the long scrollable form', () => {
    const s = setup(); click(s.h.render(), '鼠尾草'); click(s.h.render(), '關閉');
    expect(button(s.h.render(), '放棄修改')).toBeDefined();
    const form = nodes(s.h.render()).find(n => n.type === 'form-layout')!;
    expect(button(form.props.children, '放棄修改')).toBeUndefined(); expect(button(form.props.children, '繼續編輯')).toBeUndefined();
    expect(button(form.props.footer as React.ReactNode, '放棄修改')).toBeDefined(); expect(form.props.blocked).toBe(true);
  });
  it('local photo remains a preview until saving; continue preserves it and discard does not upload', async () => {
    const s = setup(); await pick(s); expect(mocks.upload).not.toHaveBeenCalled(); click(s.h.render(), '取消'); click(s.h.render(), '繼續編輯');
    expect(preview(s.h.render()).avatar_url).toBe('blob:avatar'); click(s.h.render(), '關閉'); click(s.h.render(), '放棄修改'); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('restoring the original name and avatar removes dirty state', () => {
    const s = setup(); name(s.h.render()).props.onChangeText!('新'); click(s.h.render(), '鼠尾草'); name(s.h.render()).props.onChangeText!('旅伴'); click(s.h.render(), '奶油');
    click(s.h.render(), '取消'); expect(s.props.onClose).toHaveBeenCalledOnce();
  });
  it('back during confirmation resumes editing', () => {
    const s = setup(); click(s.h.render(), '鼠尾草'); back(s.h.render()); expect(button(s.h.render(), '放棄修改')).toBeDefined(); back(s.h.render()); expect(button(s.h.render(), '放棄修改')).toBeUndefined(); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('reopening after discard uses current server profile, not abandoned fields', () => {
    const s = setup(); name(s.h.render()).props.onChangeText!('丟棄'); click(s.h.render(), '取消'); click(s.h.render(), '放棄修改'); s.set({ visible: false }); s.set({ visible: true, profile: { ...profile, display_name: '最新' } });
    expect(name(s.h.render()).props.value).toBe('最新'); expect(button(s.h.render(), '放棄修改')).toBeUndefined();
  });
  it('same-account refresh preserves name, photo and dirty baseline', async () => {
    const s = setup(); name(s.h.render()).props.onChangeText!('新暱稱'); await pick(s); s.set({ profile: { ...profile, display_name: '背景' } });
    expect(preview(s.h.render())).toMatchObject({ display_name: '新暱稱', avatar_url: 'blob:avatar' }); click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('synchronous picker lock prevents double opening and cancel selection frees the form', async () => {
    let finish!: (value: unknown) => void; mocks.pick.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); const tree = s.h.render();
    click(tree, '上傳自己的圖片'); click(tree, '上傳自己的圖片'); expect(mocks.pick).toHaveBeenCalledOnce(); click(s.h.render(), '取消選圖');
    finish(picked); await flush(); expect(preview(s.h.render()).avatar_url).toBe('preset:cream'); expect(button(s.h.render(), '儲存個人檔案')?.props.disabled).toBe(false);
  });
  it('a canceled file dialog preserves the old avatar and allows closing', async () => {
    mocks.pick.mockResolvedValue({ canceled: true, assets: null }); const s = setup(); click(s.h.render(), '上傳自己的圖片'); await flush(); click(s.h.render(), '關閉'); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(preview(s.h.render()).avatar_url).toBe('preset:cream');
  });
  it('closing during a pending picker ignores its late result and does not fetch it', async () => {
    let finish!: (value: unknown) => void; mocks.pick.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); click(s.h.render(), '上傳自己的圖片'); click(s.h.render(), '關閉'); s.set({ visible: false });
    finish(picked); await flush(); expect(global.fetch).not.toHaveBeenCalled(); expect(preview(s.h.render()).avatar_url).toBe('preset:cream');
  });
  it('switching accounts during image read ignores its late data', async () => {
    let finish!: (value: ArrayBuffer) => void; vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: () => new Promise<ArrayBuffer>(r => { finish = r; }) })));
    const s = setup(); click(s.h.render(), '上傳自己的圖片'); await flush(); s.set({ profile: { ...profile, id: 'other', avatar_url: 'preset:sky' } }); finish(new ArrayBuffer(2)); await flush();
    expect(preview(s.h.render()).avatar_url).toBe('preset:sky'); expect(button(s.h.render(), '儲存個人檔案')?.props.disabled).toBe(false);
  });
  it('save lock prevents duplicate requests and closing before rerender, disables editing then saves once', async () => {
    let finish!: (p: Profile) => void; mocks.save.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); name(s.h.render()).props.onChangeText!('新暱稱'); const tree = s.h.render();
    click(tree, '儲存個人檔案'); click(tree, '儲存個人檔案'); click(tree, '關閉'); click(tree, '取消'); back(tree);
    expect(mocks.save).toHaveBeenCalledOnce(); expect(s.props.onClose).not.toHaveBeenCalled(); expect(name(s.h.render()).props.editable).toBe(false); expect(button(s.h.render(), '鼠尾草')?.props.disabled).toBe(true);
    finish({ ...profile, display_name: '新暱稱' }); await flush(); expect(s.props.onSaved).toHaveBeenCalledOnce(); expect(s.props.onClose).toHaveBeenCalledOnce();
  });
  it('failed save keeps nickname and selected photo for a successful retry', async () => {
    mocks.save.mockRejectedValueOnce({ message: '暫時無法儲存' }); const s = setup(); name(s.h.render()).props.onChangeText!('新暱稱'); await pick(s); click(s.h.render(), '儲存個人檔案'); await flush();
    expect(mocks.alert).toHaveBeenCalledWith('儲存個人檔案失敗', '暫時無法儲存'); expect(preview(s.h.render())).toMatchObject({ display_name: '新暱稱', avatar_url: 'blob:avatar' });
    click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled(); click(s.h.render(), '繼續編輯'); click(s.h.render(), '儲存個人檔案'); await flush();
    expect(mocks.save).toHaveBeenLastCalledWith({ display_name: '新暱稱', avatar_url: 'https://example.test/new.gif' }, 'u'); expect(s.props.onClose).toHaveBeenCalledOnce();
  });
  it('a failed upload retains photo preview and does not write profile', async () => {
    mocks.upload.mockRejectedValue(new Error('上傳失敗')); const s = setup(); await pick(s); click(s.h.render(), '儲存個人檔案'); await flush();
    expect(mocks.save).not.toHaveBeenCalled(); expect(preview(s.h.render()).avatar_url).toBe('blob:avatar'); click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('account switch during upload prevents the subsequent profile update', async () => {
    let finish!: (url: string) => void; mocks.upload.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); await pick(s); click(s.h.render(), '儲存個人檔案');
    s.set({ profile: { ...profile, id: 'other', display_name: '其他旅伴' } }); finish('https://example.test/new.gif'); await flush();
    expect(mocks.save).not.toHaveBeenCalled(); expect(s.props.onSaved).not.toHaveBeenCalled(); expect(s.props.onClose).not.toHaveBeenCalled(); expect(name(s.h.render()).props.value).toBe('其他旅伴');
  });
  it.each([false, true])('ignores old save result after switching accounts (reject=%s)', async reject => {
    let finish!: (p: Profile) => void; let fail!: (e: unknown) => void; mocks.save.mockImplementation(() => new Promise((r, j) => { finish = r; fail = j; })); const s = setup(); click(s.h.render(), '儲存個人檔案');
    s.set({ profile: { ...profile, id: 'other' } }); if (reject) fail(new Error('舊錯誤')); else finish(profile); await flush();
    expect(s.props.onSaved).not.toHaveBeenCalled(); expect(s.props.onClose).not.toHaveBeenCalled(); expect(mocks.alert).not.toHaveBeenCalled(); expect(button(s.h.render(), '儲存個人檔案')?.props.disabled).toBe(false);
  });
  it('unmount during upload suppresses subsequent writes and callbacks', async () => {
    let finish!: (url: string) => void; mocks.upload.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); await pick(s); click(s.h.render(), '儲存個人檔案'); s.h.unmount(); finish('https://example.test/new.gif'); await flush();
    expect(mocks.save).not.toHaveBeenCalled(); expect(s.props.onSaved).not.toHaveBeenCalled(); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('account switch while fetching the current profile prevents writes', async () => {
    let finish!: (p: Profile) => void; mocks.current.mockImplementation(() => new Promise(r => { finish = r; })); const s = setup(); s.set({ profile: null });
    name(s.h.render()).props.onChangeText!('舊輸入'); click(s.h.render(), '儲存個人檔案'); s.set({ profile: { ...profile, id: 'other' } }); finish(profile); await flush();
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); expect(s.props.onSaved).not.toHaveBeenCalled(); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('account switch while waiting for the file response skips reading its body', async () => {
    const read = vi.fn(async () => new ArrayBuffer(2)); let finish!: (r: unknown) => void; vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { finish = r; })));
    const s = setup(); click(s.h.render(), '上傳自己的圖片'); await flush(); s.set({ profile: { ...profile, id: 'other', avatar_url: 'preset:sky' } }); finish({ ok: true, arrayBuffer: read }); await flush();
    expect(read).not.toHaveBeenCalled(); expect(preview(s.h.render()).avatar_url).toBe('preset:sky');
  });
  it('a pending parent onSaved cannot close a different account editor', async () => {
    let finish!: () => void; const onSaved = vi.fn(() => new Promise<void>(r => { finish = r; })); const s = setup(); s.set({ onSaved }); click(s.h.render(), '儲存個人檔案'); await flush(); expect(onSaved).toHaveBeenCalledOnce();
    s.set({ profile: { ...profile, id: 'other', display_name: '其他旅伴' } }); finish(); await flush();
    expect(s.props.onClose).not.toHaveBeenCalled(); expect(name(s.h.render()).props.value).toBe('其他旅伴'); expect(button(s.h.render(), '儲存個人檔案')?.props.disabled).toBe(false);
  });
  it('old picker results cannot replace a newer selection after close/reopen', async () => {
    let finishOld!: (r: unknown) => void; mocks.pick.mockImplementationOnce(() => new Promise(r => { finishOld = r; })); const s = setup(); click(s.h.render(), '上傳自己的圖片'); click(s.h.render(), '關閉');
    s.set({ visible: false }); s.set({ visible: true }); await pick(s); finishOld({ ...picked, assets: [{ ...picked.assets[0], uri: 'blob:old' }] }); await flush();
    expect(preview(s.h.render()).avatar_url).toBe('blob:avatar'); expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['picker', 'response', 'body'])('failed %s preserves the original image and releases the selection lock', async stage => {
    if (stage === 'picker') mocks.pick.mockRejectedValue({ message: '圖片讀取失敗' });
    else vi.stubGlobal('fetch', vi.fn(async () => ({ ok: stage !== 'response', arrayBuffer: async () => { throw new Error('圖片讀取失敗'); } })));
    const s = setup(); click(s.h.render(), '上傳自己的圖片'); await flush();
    expect(mocks.alert).toHaveBeenCalledOnce(); expect(preview(s.h.render()).avatar_url).toBe('preset:cream'); expect(button(s.h.render(), '儲存個人檔案')?.props.disabled).toBe(false);
    click(s.h.render(), '取消'); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
  });
});
