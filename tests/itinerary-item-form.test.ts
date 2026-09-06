import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatFlightTitle, parseFlightText } from '../lib/ai-parser';
import { canSaveItineraryItem, submitItineraryItem, resolveItineraryContext } from '../lib/itinerary';

describe('itinerary item form validation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [{ routeId: 'search-id' }, 'search-id'],
    [{ routeTripId: ['search-trip'] }, 'search-trip'],
    [{ activeTripId: 'active-trip' }, 'active-trip'],
    [{}, 'mobile-trip'],
  ])('saves with mobile fallbacks when trip props are absent: %j', async (input, expectedId) => {
    vi.stubGlobal('window', { location: { pathname: '/trips/mobile-trip' } });
    const context = resolveItineraryContext(input);
    const saveApi = vi.fn(async () => {});
    await expect(submitItineraryItem({ trip_id: context.tripId, day_number: context.day, created_by: 'user', location_name: '手機新增景點' }, undefined, saveApi)).resolves.toBe(true);
    expect(saveApi).toHaveBeenCalledWith(expect.objectContaining({ trip_id: expectedId, day_number: 1 }));
  });
  it('reports the specific missing ID without calling the save API', async () => {
    vi.stubGlobal('window', { location: { pathname: '/login' } });
    const context = resolveItineraryContext({});
    const saveApi = vi.fn(async () => {});
    await expect(submitItineraryItem({ trip_id: context.tripId, created_by: 'user', location_name: '景點' }, saveApi)).rejects.toThrow('找不到行程 ID (Trip ID missing)');
    expect(saveApi).not.toHaveBeenCalled();
  });
  it('reads the latest pathname at submission and rejects route placeholders', () => {
    vi.stubGlobal('window', { location: { pathname: '/trips/%5Bid%5D' } });
    expect(resolveItineraryContext({}).tripId).toBe('');
    window.location.pathname = '/trips/new-trip';
    expect(resolveItineraryContext({}).tripId).toBe('new-trip');
  });
  it.each([undefined, null, 'invalid', {}])('saves using URL context and the API fallback without callback props: %s', async (callback) => {
    const context = resolveItineraryContext({ routeId: ['trip-from-url'], dayIndex: null });
    const saved: unknown[] = [];
    await expect(submitItineraryItem({ trip_id: context.tripId, day_number: context.day, created_by: 'u', location_name: '手動景點' }, callback as Parameters<typeof submitItineraryItem>[1], async (payload) => { saved.push(payload); })).resolves.toBe(true);
    expect(saved).toEqual([{ trip_id: 'trip-from-url', day_number: 1, created_by: 'u', location_name: '手動景點' }]);
  });
  it('preserves explicit context and converts zero-based dayIndex', () => {
    expect(resolveItineraryContext({ tripId: 'explicit', routeId: 'url', day: 3, dayIndex: 0 })).toEqual({ tripId: 'explicit', day: 3 });
    expect(resolveItineraryContext({ tripId: '', routeId: 'url', dayIndex: 2 })).toEqual({ tripId: 'url', day: 3 });
    expect(resolveItineraryContext({ routeId: 'url' })).toEqual({ tripId: 'url', day: 1 });
  });
  it('does not retry failed callbacks through fallback and risk duplicate writes', async () => {
    let fallbackCalls = 0;
    await expect(submitItineraryItem({ trip_id: 't', created_by: 'u', location_name: '景點' }, async () => { throw new Error('denied'); }, async () => { fallbackCalls++; })).rejects.toThrow('denied');
    expect(fallbackCalls).toBe(0);
  });
  it('propagates the actual database failure for the UI to display', async () => {
    await expect(submitItineraryItem({ trip_id: 't', created_by: 'u', location_name: '景點' }, async () => { throw new Error('permission denied'); })).rejects.toThrow('permission denied');
  });
  it('enables saving after a user manually enters a non-empty title', () => {
    expect(canSaveItineraryItem('  淺草寺  ')).toBe(true);
  });

  it('keeps saving disabled when the title is empty', () => {
    expect(canSaveItineraryItem('   ')).toBe(false);
    expect(canSaveItineraryItem(null)).toBe(false);
  });

  it('wires the title-only validation to the modal save button', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryItemModal.tsx'), 'utf8');
    expect(source).toContain('const titleValid = canSaveItineraryItem(name);');
    expect(source).toContain('disabled={!titleValid || saving}');
    expect(source).toContain('zIndex: 9999');
  });

  it('keeps the save action enabled for an AI-generated flight title and submits it', () => {
    const flight = parseFlightText('台北...飛往大阪...06:30~10:10...BR178');
    expect(flight).not.toBeNull();
    expect(canSaveItineraryItem(formatFlightTitle(flight!))).toBe(true);

    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryItemModal.tsx'), 'utf8');
    expect(source).toContain('await submitItineraryItem(payload, onSave,');
    expect(source).toContain('disabled={!titleValid || saving}');
    expect(source).toContain('setAddress(getFlightDestinationAddress(flight) ?? \'\')');
    expect(source).toContain('setDuration(flight.durationMinutes === null ? \'\' : String(flight.durationMinutes))');
  });

  it('submits a complete manually entered form through the save action', async () => {
    const submitted: unknown[] = [];
    const didSubmit = await submitItineraryItem({
      trip_id: 'trip-1',
      created_by: 'user-1',
      day_number: 1,
      location_name: '新北市立土城國民中學',
      address: '新北市土城區',
      time: '09:00',
      category: 'spot',
      latitude: null,
      longitude: null,
    }, async (payload) => {
      submitted.push(payload);
    });

    expect(didSubmit).toBe(true);
    expect(submitted).toHaveLength(1);
    expect((submitted[0] as { location_name: string }).location_name).toBe('新北市立土城國民中學');
  });

  it('keeps the web action layer above overlays and accepts pointer input', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/ItineraryItemModal.tsx'), 'utf8');
    expect(source).toContain('pointerEvents="auto"');
    expect(source).toContain('zIndex: 9999');
    expect(source).toContain('onPress={() => void save()}');
  });
});
