import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness } from './helpers/interaction-harness';
import { draftKey, writeDraft, type DraftStorage } from '../lib/form-drafts';
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args) }; });
vi.mock('@/lib/form-drafts', async () => import('../lib/form-drafts'));
import { useFormDraft } from '../src/hooks/useFormDraft';
const scope = { userId: 'u', tripId: 't', form: 'item', recordId: 'new' };
function memory(): DraftStorage { const values = new Map<string, string>(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); } }; }
afterEach(() => vi.unstubAllGlobals());
describe('form draft interactions', () => {
  it('does not prompt an untouched form, but dirty close needs explicit consent', () => {
    const storage = memory(), close = vi.fn(); let value = { title: '' }; let draft!: ReturnType<typeof useFormDraft>;
    const h = harness(() => { draft = useFormDraft({ visible: true, scope, initial: { title: '' }, value, onRestore: (v) => { value = v as typeof value; }, onClose: close, storage }); return null; });
    h.render(); h.render(); draft.requestClose(); expect(close).toHaveBeenCalledOnce();
    close.mockClear(); value = { title: '難波' }; h.render(); draft.requestClose(); h.render(); expect(close).not.toHaveBeenCalled(); expect(draft.confirmClose).toBe(true);
    draft.cancelClose(); h.render(); expect(draft.confirmClose).toBe(false);
    draft.requestClose(); h.render(); draft.keepAndClose(); expect(close).toHaveBeenCalledOnce();
    expect(storage.getItem(draftKey(scope)!)).toContain('難波'); h.unmount();
  });
  it('offers recovery without changing the current form until confirmed', () => {
    const storage = memory(); writeDraft(storage, draftKey(scope)!, { title: '' }, { title: '草稿' });
    let value = { title: '' }, draft!: ReturnType<typeof useFormDraft>;
    const restore = vi.fn((v) => { value = v; });
    const h = harness(() => { draft = useFormDraft({ visible: true, scope, initial: { title: '' }, value, onRestore: restore, onClose: vi.fn(), storage }); return null; });
    h.render(); h.render(); expect(restore).not.toHaveBeenCalled(); expect(draft.recovery).not.toBeNull();
    draft.restore(); h.render(); expect(value.title).toBe('草稿'); expect(draft.status).toContain('本機草稿');
    draft.markSaved(); expect(storage.getItem(draftKey(scope)!)).toBeNull(); h.unmount();
  });
  it('blocks recovery when the saved record has changed', () => {
    const existingScope = { ...scope, recordId: 'existing' };
    const storage = memory(); writeDraft(storage, draftKey(existingScope)!, { title: 'old' }, { title: 'draft' });
    const restore = vi.fn(); let draft!: ReturnType<typeof useFormDraft>;
    const h = harness(() => { draft = useFormDraft({ visible: true, scope: existingScope, initial: { title: 'online-new' }, value: { title: 'online-new' }, onRestore: restore, onClose: vi.fn(), storage }); return null; });
    h.render(); h.render(); draft.restore(); h.render(); expect(restore).not.toHaveBeenCalled(); expect(draft.recovery?.conflict).toBe(true); h.unmount();
  });
  it('shows storage failure and does not close claiming a draft was kept', () => {
    const close = vi.fn(); let draft!: ReturnType<typeof useFormDraft>, value = { title: '' };
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: vi.fn() };
    const h = harness(() => { draft = useFormDraft({ visible: true, scope, initial: { title: '' }, value, onRestore: vi.fn(), onClose: close, storage }); return null; });
    h.render(); h.render(); value = { title: '未存' }; h.render(); h.render(); draft.keepAndClose(); h.render();
    expect(close).not.toHaveBeenCalled(); expect(draft.status).toContain('尚未保留'); h.unmount();
  });
  it('protects browser refresh and cleans up its listener on unmount', () => {
    const listeners = new Map<string, (event: { preventDefault: () => void; returnValue?: string }) => void>();
    vi.stubGlobal('window', { addEventListener: (key: string, fn: typeof listeners extends Map<string, infer F> ? F : never) => listeners.set(key, fn), removeEventListener: (key: string) => listeners.delete(key) });
    let value = { title: '' }; const storage = memory();
    const h = harness(() => { useFormDraft({ visible: true, scope, initial: { title: '' }, value, onRestore: vi.fn(), onClose: vi.fn(), storage }); return null; });
    h.render(); h.render(); value = { title: '未送出' }; h.render(); const event = { preventDefault: vi.fn(), returnValue: '' };
    listeners.get('beforeunload')!(event); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(storage.getItem(draftKey(scope)!)).toContain('未送出');
    h.unmount(); expect(listeners.has('beforeunload')).toBe(false);
  });
  it('clears an unaccepted recovery draft after the user successfully saves the current form', () => {
    const storage = memory(); writeDraft(storage, draftKey(scope)!, { title: '' }, { title: '舊草稿' });
    let draft!: ReturnType<typeof useFormDraft>;
    const h = harness(() => { draft = useFormDraft({ visible: true, scope, initial: { title: '' }, value: { title: '本次儲存' }, onRestore: vi.fn(), onClose: vi.fn(), storage }); return null; });
    h.render(); h.render(); draft.markSaved(); expect(storage.getItem(draftKey(scope)!)).toBeNull(); h.unmount();
  });
  it('defers SPA back navigation until the dirty form choice is confirmed', () => {
    const close = vi.fn(), leave = vi.fn(); let value = { title: '' }, draft!: ReturnType<typeof useFormDraft>;
    const h = harness(() => { draft = useFormDraft({ visible: true, scope, initial: { title: '' }, value, onRestore: vi.fn(), onClose: close, storage: memory() }); return null; });
    h.render(); h.render(); value = { title: '資料' }; h.render(); draft.requestLeave(leave); h.render();
    expect(leave).not.toHaveBeenCalled(); expect(draft.confirmClose).toBe(true);
    draft.cancelClose(); draft.requestClose(); h.render(); draft.discardAndClose(); expect(leave).not.toHaveBeenCalled();
    h.unmount();
  });
});
