import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftKey, readDraft, writeDraft, removeMatchingDraft, DRAFT_TTL, type DraftStorage } from '../lib/form-drafts';
const scope = { userId: 'user', tripId: 'trip', form: 'item', recordId: 'new' };
function memory(): DraftStorage { const map = new Map<string, string>(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } }; }
afterEach(() => vi.unstubAllGlobals());
describe('scoped form drafts', () => {
  it('isolates users, trips, forms and record identities', () => {
    const key = draftKey(scope);
    for (const variant of [{ userId: 'other' }, { tripId: 'other' }, { form: 'expense' }, { recordId: 'existing' }]) expect(draftKey({ ...scope, ...variant })).not.toBe(key);
    expect(key).toMatch(/^travel-planner-offline:/);
    expect(draftKey({ ...scope, userId: '' })).toBeNull();
  });
  it('restores exact JSON only within TTL and reports stale record conflicts', () => {
    const store = memory(); const key = draftKey(scope)!;
    writeDraft(store, key, { title: '' }, { title: '難波' }, 1000);
    expect(readDraft(store, key, { title: '' }, 1001)).toEqual(expect.objectContaining({ data: { title: '難波' }, conflict: false }));
    expect(readDraft(store, key, { title: '旅伴更新' }, 1001)?.conflict).toBe(true);
    expect(readDraft(store, key, { title: '' }, 1001 + DRAFT_TTL)).toBeNull();
  });
  it('rejects corrupted, non-object or file-bearing data instead of storing attachments', () => {
    const store = memory(); const key = draftKey(scope)!;
    store.setItem(key, '{'); expect(readDraft(store, key, {})).toBeNull();
    expect(() => writeDraft(store, key, {}, { attachment: new Blob(['secret']) })).toThrow();
    expect(() => writeDraft(store, key, {}, { title: 'ok', number: NaN })).toThrow();
  });
  it('does not let an old save delete a new draft', () => {
    const store = memory(); const key = draftKey(scope)!;
    writeDraft(store, key, {}, { title: '新草稿' });
    removeMatchingDraft(store, key, { title: '舊草稿' });
    expect(readDraft(store, key, {})?.data).toEqual({ title: '新草稿' });
    removeMatchingDraft(store, key, { title: '新草稿' }); expect(readDraft(store, key, {})).toBeNull();
  });
});
