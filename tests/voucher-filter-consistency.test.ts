import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@/lib/voucher-files', async () => import('../lib/voucher-files'));
vi.mock('@/lib/reservation-tags', () => ({ normalizeReservationTags: () => [] }));
vi.mock('@/lib/itinerary-api', () => ({ updateItineraryItemReservationTags: vi.fn() }));
vi.mock('../src/components/VoucherPreviewModal', () => ({ VoucherPreviewModal: 'preview-modal' }));
vi.mock('../src/components/VoucherUploadModal', () => ({ VoucherUploadModal: 'upload-modal' }));
vi.mock('../src/components/VoucherMetadataModal', () => ({ VoucherMetadataModal: 'metadata-modal' }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
vi.mock('../src/components/VoucherOfflineAction', () => ({ VoucherOfflineAction: 'offline-action' }));
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
afterEach(() => vi.unstubAllGlobals());
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

describe('voucher card usability and list states', () => {
  it('copies the selected card reference without opening preview', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { onLine: true, clipboard: { writeText } });
    const h = setup([{ ...voucher('first'), reservation_number: 'ABC-1' }, { ...voucher('second'), reservation_number: 'XYZ-2' }]);
    const card = nodes(h.render()).find(n => n.key === 'second')!;
    const preview = nodes(card).find(n => n.props.accessibilityLabel === '預覽票券：second')!;
    expect(nodes(preview).some(n => n.props.accessibilityLabel === '複製預約編號：second')).toBe(false);
    await press(card, '複製預約編號：second');
    expect(writeText).toHaveBeenCalledWith('XYZ-2');
    expect(text(h.render())).toContain('預約編號已複製');
    expect(nodes(h.render()).find(n => n.type === 'preview-modal')!.props.voucher).toBeNull();
    expect(nodes(h.render()).some(n => n.key === 'copy-first')).toBe(false);
    h.unmount();
  });
  it('omits blank references and gives manual copy feedback on clipboard rejection', async () => {
    vi.stubGlobal('navigator', { onLine: true, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const h = setup([voucher('blank'), { ...voucher('copy'), reservation_number: 'A1' }]);
    expect(nodes(h.render()).some(n => n.props.accessibilityLabel === '複製預約編號：blank')).toBe(false);
    await press(h.render(), '複製預約編號：copy');
    expect(text(h.render())).toContain('手動複製');
    h.unmount();
  });
  it('keeps controls while loading and never claims the cloud list is empty yet', () => {
    const h = setup([]);
    expect(text(h.render())).toContain('正在載入票券');
    expect(text(h.render())).toContain('預約與票券');
    expect(text(h.render())).not.toContain('目前還沒有預約或票券');
    h.unmount();
  });
  it('distinguishes filter misses and clears the current category', () => {
    const h = setup([voucher('hotel')]);
    press(h.render(), '篩選機票');
    expect(text(h.render())).toContain('沒有符合目前篩選的票券');
    press(h.render(), '清除票券篩選');
    expect(text(h.render())).toContain('hotel');
    h.unmount();
  });
  it('offers the expired toggle when the hidden expired collection is the only data', () => {
    const h = setup([voucher('old', 'hotel', '2000-01-01T00:00:00')]);
    expect(text(h.render())).toContain('目前只有已過期票券');
    press(h.render(), '查看已過期票券');
    expect(text(h.render())).toContain('old');
    h.unmount();
  });
  it('retains cached rows on a failed read and exposes a working retry', async () => {
    api.list.mockRejectedValueOnce(new Error('read failed'));
    const h = setup([voucher('cached')]); await Promise.resolve();
    expect(text(h.render())).toContain('cached');
    expect(text(h.render())).toContain('載入票券失敗');
    api.list.mockResolvedValueOnce([voucher('fresh')]);
    await press(h.render(), '重新載入票券');
    expect(text(h.render())).toContain('fresh');
    h.unmount();
  });
  it('distinguishes offline with no cached list and sends no list request', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const h = setup([]);
    expect(text(h.render())).toContain('目前離線');
    expect(text(h.render())).not.toContain('目前還沒有預約或票券');
    expect(api.list).not.toHaveBeenCalled();
    h.unmount();
  });
  it('offers the existing upload modal after an authoritative empty response', async () => {
    api.list.mockResolvedValueOnce([]);
    const h = setup([]); await Promise.resolve();
    press(h.render(), '新增第一張票券');
    expect(nodes(h.render()).find(n => n.type === 'upload-modal')!.props.visible).toBe(true);
    h.unmount();
  });
  it('refreshes card offline status when the preview closes', () => {
    const h = setup([voucher('ticket')]);
    const revision = nodes(h.render()).find(n => n.type === 'offline-action')!.props.revision;
    (nodes(h.render()).find(n => n.type === 'preview-modal')!.props.onClose as () => void)();
    expect(nodes(h.render()).find(n => n.type === 'offline-action')!.props.revision).not.toBe(revision);
    h.unmount();
  });
  it.each(['edit', 'delete', 'bind'])('finishes the loading indicator when %s invalidates an older pending read', async (operation) => {
    let finish!: (rows: Voucher[]) => void;
    api.list.mockImplementationOnce(() => new Promise<Voucher[]>(resolve => { finish = resolve; }));
    const current = voucher('row-current');
    const h = setup([current]);
    expect(text(h.render())).toContain('正在載入票券');
    if (operation === 'edit') {
      await (nodes(h.render()).find(n => n.type === 'metadata-modal')!.props.onSaved as (v: Voucher) => Promise<void>)({ ...current, notes: 'updated' });
    } else if (operation === 'delete') {
      api.remove.mockResolvedValueOnce(undefined);
      const remove = nodes(h.render()).find(n => n.props.onPress && text(n) === '刪除')!;
      (remove.props.onPress as (event: { stopPropagation: () => void }) => void)({ stopPropagation() {} });
      nodes(h.render()).find(n => n.props.onPress && text(n) === '確認刪除')!.props.onPress!();
      await Promise.resolve();
    } else {
      api.update.mockResolvedValueOnce({ ...current, item_id: null });
      nodes(h.render()).find(n => n.props.onPress && text(n) === '綁定至景點')!.props.onPress!();
      nodes(h.render()).find(n => n.props.onPress && text(n) === '確認綁定')!.props.onPress!();
      await Promise.resolve();
    }
    expect(text(h.render())).not.toContain('正在載入票券');
    finish([current]); await Promise.resolve();
    expect(text(h.render())).not.toContain('正在載入票券');
    if (operation === 'delete') expect(h.labels()).toEqual([]);
    h.unmount();
  });
});
