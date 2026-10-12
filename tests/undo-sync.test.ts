import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUndoController, getSyncPresentation } from '../lib/undo-sync';
import { moveItineraryItemAcrossDays } from '../lib/itinerary-move';
import { applyItineraryOrder, type ItineraryItem } from '../lib/itinerary';

afterEach(() => vi.useRealTimers());
describe('undo grace period', () => {
  it('deduplicates double clicks before making any API call', async () => {
    const commit = vi.fn(async () => undefined);
    const controller = createUndoController({ onChange: vi.fn(), onError: vi.fn() });
    const action = { key: 'delete:item', label: 'delete', commit };
    await Promise.all([controller.stage(action), controller.stage(action), controller.stage(action)]);
    expect(commit).not.toHaveBeenCalled();
    await controller.dispose();
    expect(commit).toHaveBeenCalledOnce();
  });
  it('flushes a stage already in progress when the screen unmounts', async () => {
    const commit = vi.fn(async () => undefined);
    const controller = createUndoController({ onChange: vi.fn(), onError: vi.fn() });
    const staged = controller.stage({ label: 'move', commit });
    await controller.dispose();
    await staged;
    await controller.stage({ label: 'ignored', commit });
    expect(commit).toHaveBeenCalledOnce();
  });
  it('undoes an optimistic action without ever sending its delete request', async () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const onChange = vi.fn();
    const controller = createUndoController({ onChange, onError: vi.fn() });
    await controller.stage({ label: '已刪除景點', commit });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ label: '已刪除景點' }));
    controller.undo();
    await vi.advanceTimersByTimeAsync(9000);
    expect(commit).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it('commits an expired action exactly once even when flush is called twice', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => undefined);
    const controller = createUndoController({ onChange: vi.fn(), onError: vi.fn() });
    await controller.stage({ label: '已移至 Day 2', commit });
    await vi.advanceTimersByTimeAsync(8000);
    await Promise.all([controller.flush(), controller.flush()]);
    expect(commit).toHaveBeenCalledOnce();
  });
  it('flushes the previous change before accepting another action', async () => {
    const calls: string[] = [];
    const controller = createUndoController({ onChange: vi.fn(), onError: vi.fn() });
    await controller.stage({ label: 'first', commit: async () => { calls.push('first'); } });
    await controller.stage({ label: 'second', commit: async () => { calls.push('second'); } });
    expect(calls).toEqual(['first']);
    controller.undo();
    await controller.flush();
    expect(calls).toEqual(['first']);
  });
  it('reports failed commits and releases the pending preview', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onChange = vi.fn();
    const controller = createUndoController({ onChange, onError });
    await controller.stage({ label: '排序', commit: async () => { throw new Error('offline storage failed'); } });
    await expect(controller.flush()).rejects.toThrow('offline storage failed');
    expect(onError).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(9000);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('itinerary preview and undo', () => {
  const original = [
    { id: 'a', trip_id: 'trip', day_number: 1, position: 0, time: '09:00', location_name: '大阪城' },
    { id: 'b', trip_id: 'trip', day_number: 1, position: 1, time: '10:00', location_name: '黑門市場' },
    { id: 'c', trip_id: 'trip', day_number: 2, position: 0, time: '11:00', location_name: '梅田' },
  ] as ItineraryItem[];
  it.each(['delete', 'order', 'move'])('immediately previews %s and undoes it without losing a teammate edit', async (kind) => {
    let raw = original.map((item) => ({ ...item }));
    let applyPreview: ((items: ItineraryItem[]) => ItineraryItem[]) | null = null;
    const controller = createUndoController({ onChange: (action) => { applyPreview = action ? apply : null; }, onError: vi.fn() });
    const apply = (items: ItineraryItem[]) => kind === 'delete' ? items.filter((item) => item.id !== 'a')
      : kind === 'move' ? moveItineraryItemAcrossDays(items, 'a', 2)
      : applyItineraryOrder(items, [{ id: 'a', position: 1 }, { id: 'b', position: 0 }]);
    const commit = vi.fn(async () => { raw = apply(raw); });
    const displayed = () => applyPreview ? applyPreview(raw) : raw;
    await controller.stage({ label: kind, commit });
    if (kind === 'delete') expect(displayed().some((item) => item.id === 'a')).toBe(false);
    if (kind === 'order') expect(displayed().find((item) => item.id === 'b')?.position).toBe(0);
    if (kind === 'move') expect(displayed().find((item) => item.id === 'a')).toMatchObject({ day_number: 2, position: 1, time: '09:00' });
    raw = raw.map((item) => item.id === 'c' ? { ...item, location_name: '梅田（旅伴已編輯）' } : item);
    controller.undo();
    expect(displayed()).toEqual(raw);
    expect(displayed().find((item) => item.id === 'c')?.location_name).toContain('旅伴已編輯');
    await controller.dispose();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('honest sync status', () => {
  it.each([
    [{ isOffline: true, pendingCount: 2 }, '離線暫存'],
    [{ isOffline: false, pendingCount: 2 }, '等待同步'],
    [{ isOffline: false, pendingCount: 0, syncing: true }, '正在同步'],
    [{ isOffline: false, pendingCount: 0, undoPending: true }, '可復原'],
    [{ isOffline: false, pendingCount: 0, error: 'failed' }, '同步失敗'],
    [{ isOffline: false, pendingCount: 0 }, '已同步'],
  ])('labels the real status %j', (input, expected) => {
    expect(getSyncPresentation(input).label).toContain(expected);
  });
});
