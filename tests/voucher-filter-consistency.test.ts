import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Voucher } from '../lib/vouchers';
import { harness, nodes, press, text } from './helpers/interaction-harness';

const api = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react') & { default: typeof React }>();
  return { ...actual, useState: (v: unknown) => actual.default.useState(v), useRef: (v: unknown) => actual.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => actual.default.useEffect(...args) };
});
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', Modal: 'dialog', ScrollView: 'section', Image: 'img', useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/vouchers-api', () => ({ listVouchers: api.list, getVoucherPreviewUrl: api.preview, updateVoucher: api.update, deleteVoucher: api.remove }));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/voucher-categories', async () => import('../lib/voucher-categories'));
vi.mock('@/lib/voucher-date-grouping', async () => import('../lib/voucher-date-grouping'));
vi.mock('@/lib/reservation-tags', () => ({ normalizeReservationTags: () => [] }));
vi.mock('@/lib/itinerary-api', () => ({ updateItineraryItemReservationTags: vi.fn() }));
vi.mock('../src/components/VoucherPreviewModal', () => ({ VoucherPreviewModal: 'preview-modal' }));
vi.mock('../src/components/VoucherUploadModal', () => ({ VoucherUploadModal: 'upload-modal' }));
vi.mock('../src/components/VoucherMetadataModal', () => ({ VoucherMetadataModal: 'metadata-modal' }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
import { VouchersPanel } from '../src/components/VouchersPanel';

const voucher = (id: string, category: Voucher['category'] = 'hotel', usage_at?: string): Voucher => ({ id, title: id, category, usage_at, trip_id: 'a', item_id: null, file_url: null, file_type: 'pdf', file_path: '', uploaded_by: 'u', created_at: '' });
function setup(rows: Voucher[]) {
  const onChanged = vi.fn();
  let props = { tripId: 'a', userId: 'u', items: [], initialVouchers: rows, onChanged };
  const h = harness(() => VouchersPanel(props));
  h.render();
  return { ...h, onChanged, setProps: (next: Partial<typeof props>) => { props = { ...props, ...next }; }, labels: () => nodes(h.render()).filter(n => n.props.numberOfLines === 2 && n.props.style && text(n).startsWith('row-')).map(text) };
}
beforeEach(() => { api.list.mockImplementation(() => new Promise(() => {})); });
describe('voucher filters use one current source', () => {
  it('shows expired rows on the first toggle and hides them on the second', () => {
    const h = setup([voucher('row-expired', 'hotel', '2000-01-01T12:00:00')]);
    press(h.render(), '展開已過期票券');
    expect(h.labels()).toContain('row-expired');
    press(h.render(), '展開已過期票券');
    expect(h.labels()).not.toContain('row-expired');
    h.unmount();
  });
  it('preserves selected category when parent data refreshes', () => {
    const h = setup([voucher('row-hotel'), voucher('row-flight', 'flight')]);
    press(h.render(), '篩選住宿');
    h.setProps({ initialVouchers: [voucher('row-hotel-new'), voucher('row-flight-new', 'flight')] });
    h.render();
    expect(h.labels()).toEqual(['row-hotel-new']);
    h.unmount();
  });
  it('preserves filters when upload reload completes', async () => {
    const h = setup([voucher('row-hotel')]);
    press(h.render(), '篩選住宿');
    api.list.mockResolvedValueOnce([voucher('row-hotel-new'), voucher('row-flight', 'flight')]);
    const upload = nodes(h.render()).find(n => n.type === 'upload-modal')!;
    await (upload.props.onUploaded as () => Promise<void>)();
    expect(h.labels()).toEqual(['row-hotel-new']);
    h.unmount();
  });
  it('metadata category edits update the source used by later filters', async () => {
    const h = setup([voucher('row-hotel')]);
    const modal = nodes(h.render()).find(n => n.type === 'metadata-modal')!;
    await (modal.props.onSaved as (v: Voucher) => Promise<void>)(voucher('row-hotel', 'flight'));
    press(h.render(), '篩選機票');
    expect(h.labels()).toEqual(['row-hotel']);
    press(h.render(), '篩選住宿');
    expect(h.labels()).toEqual([]);
    h.unmount();
  });
  it('ignores an older trip response after switching trips', async () => {
    let finish!: (rows: Voucher[]) => void;
    api.list.mockImplementationOnce(() => new Promise<Voucher[]>(resolve => { finish = resolve; }));
    const h = setup([voucher('row-old')]);
    h.setProps({ tripId: 'b', initialVouchers: [{ ...voucher('row-new'), trip_id: 'b' }] });
    h.render();
    finish([voucher('row-old')]);
    await Promise.resolve();
    expect(h.labels()).toEqual(['row-new']);
    h.unmount();
  });
  it('generates thumbnails from refreshed parent rows, even when an older load is pending', async () => {
    const h = setup([]);
    api.preview.mockResolvedValue('https://example.com/new.png');
    h.setProps({ initialVouchers: [{ ...voucher('row-image'), file_type: 'image', file_path: 'new.png' }] });
    h.render();
    await vi.waitFor(() => expect(nodes(h.render()).some(n => n.props.source?.uri === 'https://example.com/new.png')).toBe(true));
    h.unmount();
  });
  it('ignores a rejected deletion from a previous trip', async () => {
    let reject!: (error: Error) => void;
    api.remove.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const h = setup([voucher('row-old')]);
    const deleteButton = nodes(h.render()).find(n => n.props.onPress && text(n) === '刪除')!;
    (deleteButton.props.onPress as (event: { stopPropagation: () => void }) => void)({ stopPropagation() {} });
    const confirm = nodes(h.render()).find(n => n.props.onPress && text(n) === '確認刪除')!;
    confirm.props.onPress!();
    h.setProps({ tripId: 'b', initialVouchers: [] });
    h.render();
    reject(new Error('old trip error'));
    await Promise.resolve();
    expect(text(h.render())).not.toContain('old trip error');
    h.unmount();
  });
  it('a stale metadata callback cannot change a trip after switching away and back', async () => {
    const h = setup([voucher('row-old')]);
    const oldModal = nodes(h.render()).find(n => n.type === 'metadata-modal')!;
    h.setProps({ tripId: 'b', initialVouchers: [] }); h.render();
    h.setProps({ tripId: 'a', initialVouchers: [voucher('row-old')] }); h.render();
    await (oldModal.props.onSaved as (v: Voucher) => Promise<void>)(voucher('row-old', 'flight'));
    press(h.render(), '篩選住宿');
    expect(h.labels()).toEqual(['row-old']);
    h.unmount();
  });
  it('deleted rows stay removed when changing categories', async () => {
    api.remove.mockResolvedValue(undefined);
    const h = setup([voucher('row-hotel'), voucher('row-flight', 'flight')]);
    press(h.render(), '篩選住宿');
    const button = nodes(h.render()).find(n => n.props.onPress && text(n) === '刪除')!;
    (button.props.onPress as (event: { stopPropagation: () => void }) => void)({ stopPropagation() {} });
    nodes(h.render()).find(n => n.props.onPress && text(n) === '確認刪除')!.props.onPress!();
    await Promise.resolve();
    press(h.render(), '篩選全部');
    expect(h.labels()).toEqual(['row-flight']);
    press(h.render(), '篩選住宿');
    expect(h.labels()).toEqual([]);
    expect(api.remove).toHaveBeenCalledWith({ id: 'row-hotel', file_path: '' });
    h.unmount();
  });
  it('a stale list cannot overwrite newer parent rows', async () => {
    let finish!: (rows: Voucher[]) => void;
    api.list.mockImplementationOnce(() => new Promise<Voucher[]>(resolve => { finish = resolve; }));
    const h = setup([voucher('row-old')]);
    h.setProps({ initialVouchers: [voucher('row-new')] }); h.render();
    finish([voucher('row-old')]); await Promise.resolve();
    expect(h.labels()).toEqual(['row-new']);
    h.unmount();
  });
  it('account changes reload and preserve only the new account response', async () => {
    let finish!: (rows: Voucher[]) => void;
    api.list.mockImplementationOnce(() => new Promise<Voucher[]>(resolve => { finish = resolve; }));
    const h = setup([voucher('row-old')]);
    api.list.mockResolvedValueOnce([voucher('row-new')]);
    h.setProps({ userId: 'other-user', initialVouchers: [] }); h.render();
    await Promise.resolve();
    finish([voucher('row-old')]); await Promise.resolve();
    expect(h.labels()).toEqual(['row-new']);
    expect(api.list).toHaveBeenCalledTimes(2);
    h.unmount();
  });
  it('unmounted pending requests cannot start thumbnail requests', async () => {
    let finish!: (rows: Voucher[]) => void;
    api.list.mockImplementationOnce(() => new Promise<Voucher[]>(resolve => { finish = resolve; }));
    const h = setup([]);
    h.unmount();
    finish([{ ...voucher('row-image'), file_type: 'image', file_path: 'photo.png' }]);
    await Promise.resolve();
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('stale upload completion cannot refresh the previous trip', async () => {
    const h = setup([]);
    const upload = nodes(h.render()).find(n => n.type === 'upload-modal')!;
    h.setProps({ tripId: 'b', initialVouchers: [] }); h.render();
    await (upload.props.onUploaded as () => Promise<void>)();
    expect(h.onChanged).not.toHaveBeenCalled();
    h.unmount();
  });
  it.each(['upload-modal', 'metadata-modal'])('stale %s close cannot close the new trip modal', (type) => {
    const h = setup([voucher('row-old')]);
    const old = nodes(h.render()).find(n => n.type === type)!;
    h.setProps({ tripId: 'b', initialVouchers: [{ ...voucher('row-new'), trip_id: 'b' }] }); h.render();
    nodes(h.render()).find(n => n.props.onPress && text(n) === (type === 'upload-modal' ? '＋ 新增' : '編輯資料'))!.props.onPress!();
    (old.props.onClose as () => void)();
    expect(nodes(h.render()).find(n => n.type === type)!.props.visible).toBe(true);
    h.unmount();
  });
});
