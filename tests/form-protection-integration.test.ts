import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import { draftKey, readDraft, writeDraft } from '../lib/form-drafts';
import type { FormDraftProtection } from '../src/hooks/useFormDraft';
import type { Voucher } from '../lib/vouchers';
import type { TripMemberWithProfile } from '../lib/trips';
const mocks = vi.hoisted(() => ({ expenseSave: vi.fn(), updateVoucher: vi.fn(), upload: vi.fn(), picker: vi.fn() }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', ScrollView: 'scroll', Modal: 'modal', Pressable: 'button', Alert: { alert: vi.fn() }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.picker }));
vi.mock('@/lib/vouchers-api', () => ({ updateVoucher: mocks.updateVoucher, uploadVoucher: mocks.upload }));
vi.mock('@/lib/form-drafts', async () => import('../lib/form-drafts'));
vi.mock('@/lib/time-context', async () => import('../lib/time-context'));
vi.mock('@/lib/vouchers', async () => import('../lib/vouchers'));
vi.mock('@/lib/voucher-categories', async () => import('../lib/voucher-categories'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/exchange-rates', async () => import('../lib/exchange-rates'));
vi.mock('@/lib/profiles', () => ({ getProfileDisplayName: () => '旅伴' }));
vi.mock('@/lib/receipt-ocr', async () => import('../lib/receipt-ocr'));
vi.mock('../src/components/FormModalLayout', () => ({ FormModalLayout: 'form-layout' }));
vi.mock('../src/components/DraftNavigationGuard', () => ({ DraftNavigationGuard: 'navigation-guard' }));
vi.mock('../src/components/FormPickers', () => ({ DatePickerField: 'date-picker', TimePickerField: 'time-picker' }));
import { ExpenseModal } from '../src/components/ExpenseModal';
import { VoucherUploadModal } from '../src/components/VoucherUploadModal';
import { VoucherMetadataModal } from '../src/components/VoucherMetadataModal';
function memory() { const map = new Map<string, string>(); return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } }; }
function protection(tree: React.ReactNode) { return nodes(tree).find((n) => n.props.protection)?.props.protection as FormDraftProtection; }
let storage: ReturnType<typeof memory>;
beforeEach(() => { storage = memory(); vi.stubGlobal('localStorage', storage); vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => vi.unstubAllGlobals());
describe('protected expense editor', () => {
  const members = [{ user_id: 'u', trip_id: 't' }] as TripMemberWithProfile[];
  it('keeps draft on failed submission, clears only after confirmed save, and suppresses repeated clicks', async () => {
    mocks.expenseSave.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const close = vi.fn();
    const h = harness(() => ExpenseModal({ visible: true, tripId: 't', userId: 'u', members, onSave: mocks.expenseSave, onClose: close }));
    h.render(); let tree = h.render();
    nodes(tree).find((n) => n.props.placeholder === '項目名稱，例如：晚餐')!.props.onChangeText!('晚餐');
    nodes(tree).find((n) => n.props.placeholder === '金額')!.props.onChangeText!('500'); tree = h.render(); h.render();
    press(tree, '儲存旅費'); press(tree, '儲存旅費');
    await vi.waitFor(() => expect(text(h.render())).toContain('offline'));
    expect(mocks.expenseSave).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
    const key = draftKey({ userId: 'u', tripId: 't', form: 'expense', recordId: 'new' })!;
    expect(storage.getItem(key)).toContain('晚餐');
    press(h.render(), '儲存旅費'); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(storage.getItem(key)).toBeNull(); h.unmount();
  });
});
describe('protected tickets', () => {
  it('keeps upload metadata on cancel, offers recovery and never persists selected file bytes', () => {
    const close = vi.fn(); let visible = true;
    const h = harness(() => VoucherUploadModal({ visible, tripId: 't', userId: 'u', items: [], onClose: close, onUploaded: vi.fn() }));
    h.render(); let tree = h.render(); nodes(tree).find((n) => n.props.placeholder === '預約編號（選填）')!.props.onChangeText!('ABC123'); tree = h.render(); h.render();
    press(tree, '取消票券上傳'); tree = h.render(); expect(protection(tree).confirmClose).toBe(true); expect(close).not.toHaveBeenCalled();
    protection(tree).keepAndClose(); expect(close).toHaveBeenCalledOnce();
    visible = false; h.render(); visible = true; h.render(); tree = h.render(); expect(protection(tree).recovery).not.toBeNull();
    expect(nodes(tree).find((n) => n.props.placeholder === '預約編號（選填）')!.props.value).toBe('');
    protection(tree).restore(); tree = h.render(); expect(nodes(tree).find((n) => n.props.placeholder === '預約編號（選填）')!.props.value).toBe('ABC123');
    const saved = readDraft(storage, draftKey({ userId: 'u', tripId: 't', form: 'voucher-upload', recordId: 'new' })!, {});
    expect(saved?.data).not.toHaveProperty('file'); h.unmount();
  });
  it('restores existing voucher metadata only against the unchanged record and retains it when API fails', async () => {
    const voucher = { id: 'v', trip_id: 't', title: 'USJ', category: 'ticket', notes: '', reservation_number: '' } as Voucher;
    const base = { reservationNumber: '', usageDate: '', usageTime: '', notes: '', category: 'ticket' };
    const key = draftKey({ userId: 'u', tripId: 't', form: 'voucher-edit', recordId: 'v' })!;
    writeDraft(storage, key, base, { ...base, reservationNumber: 'NEW123' });
    mocks.updateVoucher.mockRejectedValue(new Error('permission denied'));
    const h = harness(() => VoucherMetadataModal({ visible: true, userId: 'u', voucher, onSaved: vi.fn(), onClose: vi.fn() }));
    h.render(); let tree = h.render(); protection(tree).restore(); tree = h.render();
    expect(nodes(tree).find((n) => n.props.placeholder === '預約編號（選填）')!.props.value).toBe('NEW123');
    press(tree, '儲存票券資料'); await vi.waitFor(() => expect(text(h.render())).toContain('permission denied'));
    expect(storage.getItem(key)).toContain('NEW123'); h.unmount();
  });
});
