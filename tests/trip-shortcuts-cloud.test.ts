import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), delete: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }));
import { listTripInfoPins, setTripInfoPin } from '../lib/trip-shortcuts-api';
beforeEach(() => {
  mocks.from.mockReturnValue(mocks); mocks.select.mockReturnValue(mocks); mocks.delete.mockReturnValue(mocks);
  mocks.eq.mockReturnValue(mocks); mocks.upsert.mockResolvedValue({ error: null });
});
describe('cloud shortcut pins', () => {
  it('reads shared pins from Supabase, not device storage', async () => {
    mocks.eq.mockResolvedValueOnce({ data: [{ item_id: 'hotel', kind: 'hotel' }], error: null });
    expect(await listTripInfoPins('trip')).toEqual([{ id: 'hotel', kind: 'hotel' }]);
    expect(mocks.from).toHaveBeenCalledWith('trip_info_pins');
    expect(mocks.eq).toHaveBeenCalledWith('trip_id', 'trip');
  });
  it('writes a single idempotent pin without replacing other members’ pins', async () => {
    await setTripInfoPin('trip', { id: 'hotel', kind: 'hotel' }, true);
    expect(mocks.upsert).toHaveBeenCalledWith({ trip_id: 'trip', item_id: 'hotel', kind: 'hotel' }, { onConflict: 'trip_id,item_id,kind', ignoreDuplicates: true });
  });
  it('never hides stored pins when legacy imports or concurrent devices exceed twelve', async () => {
    mocks.eq.mockResolvedValueOnce({ data: Array.from({ length: 15 }, (_, i) => ({ item_id: `hotel-${i}`, kind: 'hotel' })), error: null });
    expect(await listTripInfoPins('trip')).toHaveLength(15);
  });
  it('surfaces missing migration and permission errors rather than pretending local-only success', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: 'PGRST205', message: 'table missing' } });
    await expect(setTripInfoPin('trip', { id: 'hotel', kind: 'hotel' }, true)).rejects.toThrow('Migration');
  });
});
