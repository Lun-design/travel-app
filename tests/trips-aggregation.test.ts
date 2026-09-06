import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryOfflineStore } from '../lib/offline-store';
import { listTripsWithMembers } from '../lib/trips';

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: { getSession: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

const trip = {
  id: 'trip-1', title: '東京', destination: '日本', start_date: '2026-10-01', end_date: '2026-10-03',
  invite_code: 'ABC123', created_by: 'user-1', default_departure_time: '09:00', timezone: 'Asia/Tokyo',
};
const member = { trip_id: 'trip-1', user_id: 'user-2', role: 'editor', joined_at: '2026-09-01T00:00:00Z', profile: { display_name: '旅伴', avatar_url: null } };

describe('listTripsWithMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  });

  it('maps one aggregated RPC row into a trip and member list', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: [{ ...trip, members: [member] }], error: null });

    await expect(listTripsWithMembers({ offlineScope: { userId: 'user-1', tripId: 'home' }, store: createMemoryOfflineStore() })).resolves.toEqual([{ trip: { ...trip, timezone: 'Asia/Tokyo' }, members: [member] }]);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('list_trips_with_members');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('falls back to existing queries when the RPC is unavailable', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } });
    supabaseMock.from.mockImplementation((table: string) => table === 'trips'
      ? { select: () => ({ order: () => Promise.resolve({ data: [trip], error: null }) }) }
      : { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [member], error: null }) }) }) });

    await expect(listTripsWithMembers({ offlineScope: { userId: 'user-1', tripId: 'home' }, store: createMemoryOfflineStore() })).resolves.toEqual([{ trip: { ...trip, timezone: 'Asia/Tokyo' }, members: [member] }]);
    expect(supabaseMock.from).toHaveBeenCalledWith('trips');
    expect(supabaseMock.from).toHaveBeenCalledWith('trip_members');
  });
});
