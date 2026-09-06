import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatFlightTitle, parseFlightText } from '../lib/ai-parser';
import { canSaveItineraryItem, submitItineraryItem } from '../lib/itinerary';

describe('itinerary item form validation', () => {
  it.each([undefined, null, 'invalid', {}])('reports an invalid save callback without a TypeError: %s', async (callback) => {
    await expect(submitItineraryItem({ trip_id: 't', created_by: 'u', location_name: '手動景點' }, callback as Parameters<typeof submitItineraryItem>[1])).rejects.toThrow('儲存功能尚未就緒');
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
    expect(source).toContain('await submitItineraryItem(payload, onSave);');
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
