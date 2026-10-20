import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Voucher } from '../lib/vouchers';
import type { VoucherFileStore } from '../lib/voucher-files';
import { getVoucherFileKey } from '../lib/voucher-files';
import { harness, nodes, press, text } from './helpers/interaction-harness';
const api = vi.hoisted(() => ({ url: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('react', async original => {
  const a = await original<typeof import('react') & { default: typeof React }>();
  return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args) };
});
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', StyleSheet: { create: (v: unknown) => v }, AppState: { addEventListener: api.subscribe } }));
vi.mock('@/lib/vouchers-api', () => ({ getVoucherPreviewUrl: api.url }));
vi.mock('@/lib/voucher-files', async () => import('../lib/voucher-files'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
import { VoucherOfflineAction } from '../src/components/VoucherOfflineAction';

const voucher = { id: 'ticket', title: '門票', trip_id: 'trip', file_type: 'pdf', file_path: 'trip/ticket.pdf' } as Voucher;
const scope = { userId: 'u', tripId: 'trip' };
let cleanup: (() => void) | undefined;
function setup(store?: VoucherFileStore) {
  const blobs = new Map<string, Blob>();
  const fileStore = store ?? { read: async (k: string) => blobs.get(k) ?? null, write: async (k: string, b: Blob) => { blobs.set(k, b); } };
  let props = { voucher, userId: 'u', fileStore, revision: 0 };
  const h = harness(() => VoucherOfflineAction(props)); cleanup = h.unmount;
  h.render();
  return { ...h, blobs, fileStore, setProps: (next: Partial<typeof props>) => { props = { ...props, ...next }; } };
}
beforeEach(() => {
  vi.stubGlobal('caches', {});
  vi.stubGlobal('navigator', { onLine: true });
  api.url.mockResolvedValue('https://signed.example/ticket');
  api.subscribe.mockReturnValue({ remove: api.unsubscribe });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF-ticket'], { type: 'application/pdf' }))));
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe('per-card offline files', () => {
  it('does not download while checking actual local availability', async () => {
    const h = setup();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存離線備用'));
    expect(global.fetch).not.toHaveBeenCalled(); expect(api.url).not.toHaveBeenCalled();
  });
  it('stores once on rapid double click and verifies the saved blob', async () => {
    const h = setup();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    const tree = h.render();
    press(tree, '儲存離線備用：門票'); press(tree, '儲存離線備用：門票');
    await vi.waitFor(() => expect(text(h.render())).toContain('已離線備用（此裝置）'));
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(await h.fileStore.read(getVoucherFileKey(voucher, scope))).not.toBeNull();
  });
  it('never claims success if the store cannot read back its write', async () => {
    const h = setup({ read: async () => null, write: async () => {} });
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(text(h.render())).toContain('無法確認'));
    expect(text(h.render())).not.toContain('已離線備用（此裝置）');
  });
  it('shows HTTP errors and allows retry without marking the file saved', async () => {
    const h = setup();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('error', { status: 403 }));
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(text(h.render())).toContain('403'));
    expect(h.blobs.size).toBe(0);
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(text(h.render())).toContain('已離線備用（此裝置）'));
  });
  it('blocks offline downloads before requesting a signed URL', async () => {
    const h = setup();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    vi.stubGlobal('navigator', { onLine: false });
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(text(h.render())).toContain('請連線'));
    expect(api.url).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('reports unsupported storage and inaccessible cache without false missing labels', async () => {
    vi.stubGlobal('caches', undefined);
    const h = setup();
    expect(text(h.render())).toContain('此裝置不支援');
    expect(nodes(h.render()).some(n => n.props.accessibilityLabel === '儲存離線備用：門票')).toBe(false);
  });
  it('handles failed cache checks without an uncaught rejection', async () => {
    const h = setup({ read: async () => { throw new Error('cache denied'); }, write: async () => {} });
    await vi.waitFor(() => expect(text(h.render())).toContain('無法確認'));
    expect(text(h.render())).not.toContain('已離線備用（此裝置）');
  });
  it('rechecks when preview closes or file path and user change', async () => {
    const h = setup();
    h.blobs.set(getVoucherFileKey(voucher, scope), new Blob(['ticket']));
    h.setProps({ revision: 1 }); h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('已離線備用（此裝置）'));
    h.setProps({ voucher: { ...voucher, file_path: 'new.pdf' } }); h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    h.setProps({ voucher, userId: 'other' }); h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
  });
  it('rechecks after returning to the foreground and removes subscriptions on unmount', async () => {
    const browser = new EventTarget(); vi.stubGlobal('window', browser);
    const h = setup();
    h.blobs.set(getVoucherFileKey(voucher, scope), new Blob(['ticket']));
    browser.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(text(h.render())).toContain('已離線備用（此裝置）'));
    h.blobs.clear(); browser.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    h.unmount(); cleanup = undefined;
    expect(api.unsubscribe).toHaveBeenCalled();
  });
  it('aborts downloads and ignores stale checks when switching accounts', async () => {
    let finish!: (b: Blob | null) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<Blob | null>(r => { finish = r; })).mockResolvedValue(null);
    const h = setup({ read, write: async () => {} });
    h.setProps({ userId: 'other' }); h.render();
    finish(new Blob(['old ticket']));
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); });
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(signal).toBeDefined());
    h.unmount(); cleanup = undefined;
    expect(signal!.aborted).toBe(true);
  });
  it('does not cancel an active download when another preview closes', async () => {
    const h = setup();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未儲存'));
    let finish!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce(async (_, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(r => { finish = r; }); });
    press(h.render(), '儲存離線備用：門票');
    await vi.waitFor(() => expect(signal).toBeDefined());
    h.setProps({ revision: 1 }); h.render();
    expect(signal!.aborted).toBe(false);
    finish(new Response(new Blob(['%PDF-ticket'], { type: 'application/pdf' })));
    await vi.waitFor(() => expect(text(h.render())).toContain('已離線備用（此裝置）'));
  });
});
