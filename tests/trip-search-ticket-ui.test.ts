import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppTheme } from '../lib/theme';
import type { TripSearchData, TripSearchResult } from '../lib/trip-search';
import type { Voucher } from '../lib/vouchers';
import { getVoucherFileKey, type VoucherFileStore } from '../lib/voucher-files';
const mocks = vi.hoisted(() => ({ signed: vi.fn() }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react') & { default: typeof React }>();
  return { ...actual,
    useState: (initial?: unknown) => actual.default.useState(initial),
    useRef: (initial: unknown) => actual.default.useRef(initial),
    useEffect: (...args: Parameters<typeof React.useEffect>) => actual.default.useEffect(...args),
    useMemo: (...args: Parameters<typeof React.useMemo>) => actual.default.useMemo(...args),
  };
});
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Image: 'img', Modal: 'dialog', FlatList: 'list', ScrollView: 'section', Pressable: 'button', Platform: { OS: 'web' }, Linking: { openURL: vi.fn() }, useWindowDimensions: () => ({ width: 375, height: 812 }), StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock('@/lib/vouchers-api', () => ({ getVoucherPreviewUrl: mocks.signed }));
vi.mock('@/lib/voucher-files', async () => await import('../lib/voucher-files'));
vi.mock('@/lib/trip-search', async () => await import('../lib/trip-search'));
vi.mock('@/lib/theme', async () => await import('../lib/theme'));
import { VoucherPreviewModal } from '../src/components/VoucherPreviewModal';
import { TripSearchModal } from '../src/components/TripSearchModal';

type Props = { children?: React.ReactNode; onPress?: () => void; onChangeText?: (value: string) => void; source?: { uri: string }; accessibilityLabel?: string; data?: TripSearchResult[]; renderItem?: (info: { item: TripSearchResult }) => React.ReactNode };
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === 'string' ? node : '';
}
function hookHarness(renderComponent: () => React.ReactNode) {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const effects: { deps?: React.DependencyList; cleanup?: () => void }[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  let scheduled: (() => void)[] = [];
  vi.spyOn(React, 'useState').mockImplementation((initial?: unknown) => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], (value: unknown) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }] as ReturnType<typeof React.useState>;
  });
  vi.spyOn(React, 'useRef').mockImplementation((initial?: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }));
  vi.spyOn(React, 'useMemo').mockImplementation((factory) => factory());
  vi.spyOn(React, 'useEffect').mockImplementation((effect, deps) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (previous && deps && previous.deps?.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps?.[i]))) return;
    scheduled.push(() => { previous?.cleanup?.(); const cleanup = effect(); effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined }; });
  });
  return {
    render() { stateIndex = refIndex = effectIndex = 0; scheduled = []; const tree = renderComponent(); for (const run of scheduled) run(); return tree; },
    unmount() { effects.forEach((effect) => effect.cleanup?.()); },
  };
}
function memoryFiles(): VoucherFileStore {
  const files = new Map<string, Blob>();
  return { read: async (key) => files.get(key) ?? null, write: async (key, blob) => { files.set(key, blob); } };
}
const ticket = { id: 'v1', trip_id: 'trip', title: 'USJ 門票', file_path: 'trip/user/file.png', file_type: 'image', reservation_number: 'ABC123' } as Voucher;
afterEach(() => { vi.unstubAllGlobals(); mocks.signed.mockReset(); });

describe('local search interactions', () => {
  it('searches a reservation number offline and opens the matching result', () => {
    const onSelect = vi.fn();
    const data = { tripId: 'trip', items: [], vouchers: [ticket], expenses: [], places: [] } as TripSearchData;
    const harness = hookHarness(() => TripSearchModal({ visible: true, data, theme: getAppTheme('light'), isOffline: true, onClose: vi.fn(), onSelect }));
    const initial = harness.render();
    nodes(initial).find((node) => node.props.accessibilityLabel === '搜尋行程內容')!.props.onChangeText!('abc123');
    const tree = harness.render();
    expect(text(tree)).toContain('離線搜尋');
    expect(text(tree)).toContain('1 筆結果');
    const list = nodes(tree).find((node) => node.props.data && node.props.renderItem)!;
    const result = list.props.renderItem!({ item: list.props.data![0] });
    nodes(result).find((node) => node.props.onPress)!.props.onPress!();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'voucher', id: 'v1' }));
    expect(global.fetch).not.toHaveBeenCalled();
    harness.unmount();
  });
});
describe('ticket presentation interactions', () => {
  it('shows a cached image offline, copies its reference, and closes from X or background', async () => {
    const store = memoryFiles();
    await store.write(getVoucherFileKey(ticket, { userId: 'user', tripId: 'trip' }), new Blob(['image'], { type: 'image/png' }));
    const copy = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { onLine: false, clipboard: { writeText: copy } });
    const onClose = vi.fn();
    const harness = hookHarness(() => VoucherPreviewModal({ voucher: ticket, userId: 'user', fileStore: store, onClose }));
    harness.render();
    await vi.waitFor(() => expect(text(harness.render())).toContain('已離線備用'));
    const tree = harness.render();
    expect(nodes(tree).find((node) => node.props.source)?.props.source?.uri).toMatch(/^blob:/);
    nodes(tree).find((node) => node.props.accessibilityLabel === '複製預約編號')!.props.onPress!();
    await vi.waitFor(() => expect(text(harness.render())).toContain('已複製'));
    expect(copy).toHaveBeenCalledWith('ABC123');
    for (const label of ['關閉票券', '關閉票券背景']) nodes(tree).find((node) => node.props.accessibilityLabel === label)!.props.onPress!();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(mocks.signed).not.toHaveBeenCalled();
    harness.unmount();
  });
  it('stores an online ticket once on double-click and immediately displays the local file', async () => {
    const store = memoryFiles();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('caches', {});
    const download = vi.fn(async () => new Response(new Blob(['image'], { type: 'image/png' })));
    vi.stubGlobal('fetch', download);
    mocks.signed.mockResolvedValue('https://signed.example/ticket.png');
    const harness = hookHarness(() => VoucherPreviewModal({ voucher: ticket, userId: 'user', fileStore: store, onClose: vi.fn() }));
    harness.render();
    await vi.waitFor(() => expect(nodes(harness.render()).some((node) => node.props.source?.uri === 'https://signed.example/ticket.png')).toBe(true));
    const button = nodes(harness.render()).find((node) => node.props.onPress && text(node) === '儲存離線備用')!;
    button.props.onPress!(); button.props.onPress!();
    await vi.waitFor(() => expect(text(harness.render())).toContain('已儲存離線備用'));
    expect(download).toHaveBeenCalledOnce();
    expect(nodes(harness.render()).find((node) => node.props.source)?.props.source?.uri).toMatch(/^blob:/);
    harness.unmount();
  });
  it('ignores an old signed-URL response after switching tickets', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    let current = ticket;
    let oldResolve!: (value: string) => void;
    mocks.signed.mockImplementation((voucher: Voucher) => voucher.id === 'v1' ? new Promise<string>((resolve) => { oldResolve = resolve; }) : Promise.resolve('https://signed.example/new.png'));
    const harness = hookHarness(() => VoucherPreviewModal({ voucher: current, userId: 'user', fileStore: store, onClose: vi.fn() }));
    const store = memoryFiles();
    harness.render();
    await vi.waitFor(() => expect(mocks.signed).toHaveBeenCalled());
    current = { ...ticket, id: 'v2', file_path: 'new.png' };
    harness.render();
    await vi.waitFor(() => expect(nodes(harness.render()).find((node) => node.props.source)?.props.source?.uri).toBe('https://signed.example/new.png'));
    oldResolve('https://signed.example/old.png');
    await Promise.resolve();
    expect(nodes(harness.render()).find((node) => node.props.source)?.props.source?.uri).toBe('https://signed.example/new.png');
    harness.unmount();
  });
});
