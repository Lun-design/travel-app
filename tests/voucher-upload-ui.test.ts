import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ picker: vi.fn(), upload: vi.fn() }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react') & { default: typeof React }>();
  return {
    ...actual,
    useState: (initial: unknown) => actual.default.useState(initial),
    useRef: (initial: unknown) => actual.default.useRef(initial),
    useEffect: (...args: Parameters<typeof React.useEffect>) => actual.default.useEffect(...args),
  };
});
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.picker }));
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock('@/lib/vouchers-api', () => ({ uploadVoucher: mocks.upload }));
vi.mock('@/lib/vouchers', async () => await import('../lib/vouchers'));
vi.mock('@/lib/theme', async () => await import('../lib/theme'));
vi.mock('../src/components/FormPickers', () => ({ DatePickerField: () => null, TimePickerField: () => null }));
import { VoucherUploadModal } from '../src/components/VoucherUploadModal';

type Props = { children?: React.ReactNode; onPress?: () => void; accessibilityRole?: string; disabled?: boolean };
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
function modalHarness() {
  const states: unknown[] = [];
  let index = 0;
  vi.spyOn(React, 'useState').mockImplementation((initial?: unknown) => {
    const slot = index++;
    if (!(slot in states)) states[slot] = initial;
    return [states[slot], (value: unknown) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }] as ReturnType<typeof React.useState>;
  });
  vi.spyOn(React, 'useEffect').mockImplementation(() => undefined);
  vi.spyOn(React, 'useRef').mockReturnValue({ current: false });
  const onClose = vi.fn();
  const onUploaded = vi.fn();
  const render = () => { index = 0; return VoucherUploadModal({ visible: true, tripId: 'trip', userId: 'user', items: [], onClose, onUploaded }); };
  const select = () => nodes(render()).find((node) => node.props.onPress && text(node).includes('選擇圖片或 PDF'))!;
  return { render, select, onClose, onUploaded };
}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('voucher upload feedback', () => {
  it('shows unsupported GIF inline and sends no upload request', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: [{ name: 'ticket.gif', mimeType: 'image/gif', size: 100, uri: 'blob:ticket' }] });
    const harness = modalHarness();
    harness.select().props.onPress!();
    await vi.waitFor(() => expect(nodes(harness.render()).some((node) => node.props.accessibilityRole === 'alert' && text(node).includes('GIF'))).toBe(true));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(harness.onClose).not.toHaveBeenCalled();
    expect(harness.select().props.disabled).toBe(false);
  });
  it('shows Storage failures in the still-open modal, with retry enabled', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: [{ name: 'ticket.png', mimeType: 'image/png', size: 100, file: { arrayBuffer: async () => new ArrayBuffer(100) } }] });
    mocks.upload.mockRejectedValue({ message: 'new row violates row-level security policy' });
    const harness = modalHarness();
    harness.select().props.onPress!();
    await vi.waitFor(() => expect(text(harness.render())).toContain('編輯權限'));
    expect(harness.onClose).not.toHaveBeenCalled();
    expect(harness.select().props.disabled).toBe(false);
  });
  it('uploads a PNG once on rapid double-click, refreshes the list and closes', async () => {
    mocks.picker.mockResolvedValue({ canceled: false, assets: [{ name: 'ticket.png', mimeType: 'image/png', size: 100, file: { arrayBuffer: async () => new ArrayBuffer(100) } }] });
    mocks.upload.mockResolvedValue({ id: 'new-ticket' });
    const harness = modalHarness();
    const button = harness.select();
    button.props.onPress!();
    button.props.onPress!();
    await vi.waitFor(() => expect(harness.onClose).toHaveBeenCalledOnce());
    expect(mocks.picker).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.picker).toHaveBeenCalledWith(expect.objectContaining({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] }));
    expect(harness.onUploaded).toHaveBeenCalledOnce();
  });
});
