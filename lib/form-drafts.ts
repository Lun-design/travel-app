export type DraftScope = { userId: string; tripId: string; form: string; recordId: string };
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftData = Record<string, unknown>;
export const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
export function draftKey(scope: DraftScope): string | null {
  if (!scope.userId.trim() || scope.userId === 'anonymous' || !scope.tripId.trim()) return null;
  return `travel-planner-offline:draft:v1:${[scope.userId, scope.tripId, scope.form, scope.recordId].map(encodeURIComponent).join(':')}`;
}
export function browserDraftStorage(): DraftStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
/** Canonical JSON only: never persist Blob/File, dates, URLs to selected files or NaN. */
export function serializeDraft(value: unknown): string {
  function clean(input: unknown, depth = 0): unknown {
    if (depth > 16) throw new Error('草稿內容過長。');
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      if (/^(?:blob:|data:|file:)/i.test(input)) throw new Error('附件不能儲存於表單草稿。');
      return input;
    }
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map((v) => clean(v, depth + 1));
    if (typeof input === 'object' && input && Object.getPrototypeOf(input) === Object.prototype) {
      return Object.fromEntries(Object.keys(input).sort().filter((k) => (input as DraftData)[k] !== undefined).map((k) => [k, clean((input as DraftData)[k], depth + 1)]));
    }
    throw new Error('草稿僅支援文字與表單資料。');
  }
  const json = JSON.stringify(clean(value));
  if (json.length > 200_000) throw new Error('草稿內容過長，請減少明細或備註。');
  return json;
}
export function writeDraft(store: DraftStorage, key: string, base: DraftData, data: DraftData, now = Date.now()) {
  const value = serializeDraft(data), baseline = serializeDraft(base);
  store.setItem(key, JSON.stringify({ version: 1, savedAt: now, base: baseline, data: JSON.parse(value) }));
}
export function readDraft(store: DraftStorage, key: string, base: DraftData, now = Date.now()): { data: DraftData; conflict: boolean; savedAt: number } | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Number.isFinite(parsed.savedAt) || parsed.savedAt > now + 60_000 || now - parsed.savedAt >= DRAFT_TTL || typeof parsed.base !== 'string' || !parsed.data || Array.isArray(parsed.data) || typeof parsed.data !== 'object') return null;
    serializeDraft(parsed.data);
    return { data: parsed.data, savedAt: parsed.savedAt, conflict: parsed.base !== serializeDraft(base) };
  } catch { return null; }
}
export function removeMatchingDraft(store: DraftStorage, key: string, submitted: DraftData) {
  const raw = store.getItem(key);
  if (!raw) return;
  try { if (serializeDraft(JSON.parse(raw).data) !== serializeDraft(submitted)) return; } catch { return; }
  store.removeItem(key);
}
