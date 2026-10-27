import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import type { ItineraryItem } from '../lib/itinerary';
import type { Voucher } from '../lib/vouchers';
// @ts-expect-error RNWeb internal responder has no public declaration.
import PressResponder from 'react-native-web/dist/modules/usePressEvents/PressResponder.js';
const api = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), update: vi.fn(), remove: vi.fn(), tags: vi.fn() }));
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (v: unknown) => a.default.useState(v), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', Modal: 'dialog', ScrollView: 'section', Image: 'img', useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/vouchers-api', () => ({ listVouchers: api.list, getVoucherPreviewUrl: api.preview, updateVoucher: api.update, deleteVoucher: api.remove }));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/voucher-categories', async () => import('../lib/voucher-categories'));
vi.mock('@/lib/voucher-date-grouping', async () => import('../lib/voucher-date-grouping'));
vi.mock('@/lib/voucher-files', async () => import('../lib/voucher-files'));
vi.mock('@/lib/selection-keyboard', async () => import('../lib/selection-keyboard'));
vi.mock('@/lib/reservation-tags', () => ({ normalizeReservationTags: () => [] }));
vi.mock('@/lib/itinerary-api', () => ({ updateItineraryItemReservationTags: api.tags }));
vi.mock('../src/components/VoucherPreviewModal', () => ({ VoucherPreviewModal: 'preview-modal' }));
vi.mock('../src/components/VoucherUploadModal', () => ({ VoucherUploadModal: 'upload-modal' }));
vi.mock('../src/components/VoucherMetadataModal', () => ({ VoucherMetadataModal: 'metadata-modal' }));
vi.mock('../src/components/VoucherOfflineAction', () => ({ VoucherOfflineAction: 'offline-action' }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
import { VouchersPanel } from '../src/components/VouchersPanel';
const row = (id: string, category: Voucher['category'] = 'hotel'): Voucher => ({ id, title: id, category, trip_id: 't', item_id: null, file_url: null, file_type: 'pdf', file_path: '', uploaded_by: 'u', created_at: '' });
const items = [{ id: 'a', day_number: 1, location_name: '第一站' }, { id: 'b', day_number: 2, location_name: '第二站' }] as ItineraryItem[];
let cleanup: (() => void) | undefined;
beforeEach(() => { api.list.mockImplementation(() => new Promise(() => {})); api.remove.mockResolvedValue(undefined); api.tags.mockResolvedValue(undefined); });
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
function setup(rows = [row('飯店票券'), row('機票', 'flight')]) { const h = harness(() => VouchersPanel({ tripId: 't', userId: 'u', items, initialVouchers: rows })); cleanup = h.unmount; h.render(); return h; }
function named(tree: React.ReactNode, label: string) { const node = nodes(tree).find(n => n.props.accessibilityLabel === label); expect(node, label).toBeDefined(); return node!; }
function modal(tree: React.ReactNode, type: string) { return nodes(tree).find(n => n.type === type)!; }
function style(value: unknown): Record<string, unknown> { return Array.isArray(value) ? Object.assign({}, ...value.map(style)) : value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function key(tree: React.ReactNode, label: string, value = ' ') {
  const node = named(tree, label), target = { tagName: 'DIV', getAttribute: () => node.props.accessibilityRole };
  const e = { key: value, target, currentTarget: target, defaultPrevented: false, repeat: false, preventDefault: vi.fn(), stopPropagation() {}, persist() {}, nativeEvent: {} };
  const responder = new PressResponder({ onPress: node.props.onPress });
  responder.getEventHandlers().onKeyDown(e);
  (node.props.onKeyDown as ((event: typeof e) => void) | undefined)?.(e);
  responder.reset(); return e;
}
describe('voucher touch and accessible interactions', () => {
  it('exposes category checked state and preserves filtering', () => {
    const h = setup(); expect(named(h.render(), '票券分類').props.accessibilityRole).toBe('radiogroup');
    expect(named(h.render(), '篩選全部').props.accessibilityState).toMatchObject({ checked: true });
    press(h.render(), '篩選機票'); expect(named(h.render(), '篩選機票').props.accessibilityRole).toBe('radio'); expect(named(h.render(), '篩選機票').props.accessibilityState).toMatchObject({ checked: true });
    expect(nodes(h.render()).some(n => n.props.accessibilityLabel === '預覽票券：飯店票券')).toBe(false);
  });
  it('expired toggle reports its current expanded state without losing its existing action', () => {
    const h = setup(); expect(named(h.render(), '展開已過期票券').props.accessibilityState).toMatchObject({ expanded: false });
    press(h.render(), '展開已過期票券'); expect(named(h.render(), '展開已過期票券').props.accessibilityState).toMatchObject({ expanded: true });
  });
  it('all short common controls and choices are at least 44 by 44', () => {
    const h = setup(); press(h.render(), '綁定票券景點：飯店票券');
    for (const label of ['新增票券', '篩選全部', '篩選機票', '展開已過期票券', '編輯票券：飯店票券', '綁定票券景點：飯店票券', '刪除票券：飯店票券', '綁定天數：Day 1', '綁定景點：第一站', '確認綁定票券：飯店票券', '取消綁定票券']) {
      const s = style(named(h.render(), label).props.style); expect(s.minHeight, label).toBeGreaterThanOrEqual(44); expect(s.minWidth, label).toBeGreaterThanOrEqual(44);
    }
  });
  it('named edit and preview actions target the correct voucher without writing', () => {
    const h = setup(); press(h.render(), '編輯票券：飯店票券'); expect(modal(h.render(), 'metadata-modal').props.voucher).toMatchObject({ id: '飯店票券' });
    press(h.render(), '預覽票券：機票'); expect(modal(h.render(), 'preview-modal').props.voucher).toMatchObject({ id: '機票' }); expect(api.update).not.toHaveBeenCalled();
  });
  it('Day and destination selections announce state and save the original binding payload', async () => {
    const h = setup(); press(h.render(), '綁定票券景點：飯店票券'); expect(named(h.render(), '綁定天數').props.accessibilityRole).toBe('radiogroup'); expect(named(h.render(), '綁定景點').props.accessibilityRole).toBe('radiogroup');
    press(h.render(), '綁定天數：Day 2'); expect(named(h.render(), '綁定天數：Day 2').props.accessibilityState).toMatchObject({ checked: true }); press(h.render(), '綁定景點：第二站'); expect(named(h.render(), '綁定景點：第二站').props.accessibilityState).toMatchObject({ checked: true });
    api.update.mockResolvedValueOnce({ ...row('飯店票券'), item_id: 'b' }); press(h.render(), '確認綁定票券：飯店票券'); await Promise.resolve(); await Promise.resolve();
    expect(api.update).toHaveBeenCalledExactlyOnceWith('飯店票券', { item_id: 'b' }); expect(api.tags).toHaveBeenCalledWith('b', ['ticketed']);
  });
  it('cancel binding does not write; reopening restores the existing selection', () => {
    const h = setup(); press(h.render(), '綁定票券景點：飯店票券'); press(h.render(), '綁定天數：Day 2'); press(h.render(), '取消綁定票券');
    expect(api.update).not.toHaveBeenCalled(); press(h.render(), '綁定票券景點：飯店票券'); expect(named(h.render(), '綁定天數：Day 1').props.accessibilityState).toMatchObject({ checked: true });
  });
  it('binding in progress announces busy and disables destination and day controls', () => {
    api.update.mockImplementationOnce(() => new Promise(() => {})); const h = setup(); press(h.render(), '綁定票券景點：飯店票券'); press(h.render(), '確認綁定票券：飯店票券');
    expect(named(h.render(), '確認綁定票券：飯店票券').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    for (const label of ['綁定天數：Day 2', '綁定景點：第一站']) expect(named(h.render(), label).props.accessibilityState).toMatchObject({ disabled: true });
  });
  it('named delete opens confirmation, cancel writes nothing and confirm deletes the selected voucher', async () => {
    const h = setup(); const event = { stopPropagation: vi.fn() };
    (named(h.render(), '刪除票券：飯店票券').props.onPress as (e: typeof event) => void)(event); expect(event.stopPropagation).toHaveBeenCalledOnce();
    press(h.render(), '取消刪除票券'); expect(api.remove).not.toHaveBeenCalled();
    (named(h.render(), '刪除票券：機票').props.onPress as (e: typeof event) => void)(event); press(h.render(), '確認刪除票券：機票'); await Promise.resolve();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith({ id: '機票', file_path: '' });
  });
  it('the dismissible feedback accessible name retains the actual message', async () => {
    const h = setup(); (named(h.render(), '刪除票券：飯店票券').props.onPress as (e: { stopPropagation(): void }) => void)({ stopPropagation() {} });
    press(h.render(), '確認刪除票券：飯店票券'); await Promise.resolve(); await Promise.resolve();
    const toast = nodes(h.render()).find(n => n.type === 'button' && text(n) === '票券已刪除。')!;
    expect(toast.props.accessibilityLabel).toContain('票券已刪除。');
    toast.props.onPress!(); expect(text(h.render())).not.toContain('票券已刪除。');
  });
  it('Space on a category selects it without a duplicate write path', () => {
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() }); const h = setup(); const e = key(h.render(), '篩選機票'); expect(e.preventDefault).toHaveBeenCalledOnce(); expect(named(h.render(), '篩選機票').props.accessibilityState).toMatchObject({ checked: true }); expect(api.update).not.toHaveBeenCalled();
  });
  it('Enter remains handled by RNWeb and the helper adds no extra activation', () => {
    let keyup!: (e: unknown) => void;
    vi.stubGlobal('document', { addEventListener: (_: string, fn: (e: unknown) => void) => { keyup = fn; }, removeEventListener: vi.fn() }); const h = setup(); const node = named(h.render(), '篩選機票'); const activate = vi.fn(node.props.onPress); const target = { tagName: 'DIV', getAttribute: () => 'radio' };
    const e = { key: 'Enter', target, currentTarget: target, repeat: false, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation() {}, persist() {}, nativeEvent: {} };
    const responder = new PressResponder({ onPress: activate }); responder.getEventHandlers().onKeyDown(e); (node.props.onKeyDown as ((event: typeof e) => void) | undefined)?.(e); keyup(e); responder.reset();
    expect(activate).toHaveBeenCalledOnce(); expect(named(h.render(), '篩選機票').props.accessibilityState).toMatchObject({ checked: true });
  });
  it('Space chooses a binding day, and disabled options cannot change it via the helper', () => {
    vi.stubGlobal('document', {}); const h = setup(); press(h.render(), '綁定票券景點：飯店票券'); key(h.render(), '綁定天數：Day 2'); expect(named(h.render(), '綁定天數：Day 2').props.accessibilityState).toMatchObject({ checked: true });
    api.update.mockImplementationOnce(() => new Promise(() => {})); press(h.render(), '確認綁定票券：飯店票券'); key(h.render(), '綁定天數：Day 1'); expect(named(h.render(), '綁定天數：Day 2').props.accessibilityState).toMatchObject({ checked: true });
  });
});
