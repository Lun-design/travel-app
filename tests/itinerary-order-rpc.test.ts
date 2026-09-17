import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

describe('itinerary order RPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the Supabase client context and propagates RPC errors', async () => {
    const rpcError = new Error('Migration update_itinerary_items_order is unavailable');
    supabaseMock.rpc = vi.fn(function (this: unknown, name: string, args: Record<string, unknown>) {
      if (this !== supabaseMock) throw new Error('Supabase RPC client context was lost');
      expect(name).toBe('update_itinerary_items_order');
      expect(args).toEqual({ p_items: [{ id: 'item-1', position: 1 }, { id: 'item-2', position: 0 }] });
      return Promise.resolve({ data: null, error: rpcError });
    });

    const { updateItineraryItemsOrder } = await import('../lib/itinerary-api');

    await expect(updateItineraryItemsOrder([
      { id: 'item-1', position: 1 },
      { id: 'item-2', position: 0 },
    ], { offlineScope: { userId: 'user-1', tripId: 'trip-1' } })).rejects.toBe(rpcError);
  });

  it('turns a missing order migration into an actionable message', async () => {
    const { describeItineraryOrderError } = await import('../lib/itinerary-api');
    expect(describeItineraryOrderError({
      code: 'PGRST202',
      message: 'Could not find the function public.update_itinerary_items_order',
    })).toContain('20260918000000_atomic_itinerary_order.sql');
  });

  it('rolls back each platform timeline to the exact pre-click ordering', () => {
    const projectFile = (...parts: string[]) => path.resolve(process.cwd(), ...parts);
    const web = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.web.tsx'), 'utf8');
    const native = readFileSync(projectFile('src', 'components', 'ItineraryTimeline.native.tsx'), 'utf8');

    for (const source of [web, native]) {
      expect(source).toContain('setLocalItems(ordered);');
      expect(source).toContain('await (onReorder ? onReorder(orderPayload(ordered)) : updateItineraryItemsOrder(orderPayload(ordered)))');
      expect(source).toContain('up: () => { void moveItem(item.id, -1); }');
      expect(source).toContain('down: () => { void moveItem(item.id, 1); }');
      expect(source).toContain('const previous = localItems;');
      expect(source).toContain('setLocalItems(previous);');
    }
  });
});
