import { describe, expect, it } from 'vitest';
import { findBackupPlan, getOutdoorRainAlert, isOutdoorItineraryItem, shouldOfferAlternatePlan, switchToBackupPlan } from '../lib/alternate-plans';
import type { ItineraryItem } from '../lib/itinerary';

const primary: ItineraryItem = {
  id: 'spot-1', trip_id: 'trip-1', day_number: 1, position: 0, time: '10:00', location_name: '大阪城', address: '大阪市', latitude: 34.6873, longitude: 135.5262,
  notes: null, category: 'spot', created_by: 'user-1', is_backup: false, backup_for_id: null,
};
const backup: ItineraryItem = {
  ...primary, id: 'spot-2', position: 1, time: '10:00', location_name: '大阪生活今昔館', category: 'spot', is_backup: true, backup_for_id: 'spot-1',
};

describe('alternate rainy-day plans', () => {
  it('recognizes outdoor categories and location keywords', () => {
    expect(isOutdoorItineraryItem({ ...primary, category: 'outdoor' })).toBe(true);
    expect(isOutdoorItineraryItem({ ...primary, category: 'spot', location_name: '大安森林公園' })).toBe(true);
    expect(isOutdoorItineraryItem({ ...primary, category: 'spot', tags: ['outdoor'] })).toBe(true);
    expect(isOutdoorItineraryItem({ ...primary, category: 'food', location_name: '室內咖啡館' })).toBe(false);
  });

  it('raises an outdoor rain alert at 70 percent daytime probability', () => {
    const outdoor = { ...primary, category: 'spot', location_name: '海邊沙灘' };
    expect(getOutdoorRainAlert({ precipitationProbability: 70, extremeWarning: false }, [outdoor])).toMatchObject({ precipitationProbability: 70 });
    expect(getOutdoorRainAlert({ precipitationProbability: 69, extremeWarning: false }, [outdoor])).toBeNull();
    expect(getOutdoorRainAlert({ precipitationProbability: 90, extremeWarning: false }, [primary])).toBeNull();
  });

  it('offers a backup above 50% rain probability or for extreme weather', () => {
    expect(shouldOfferAlternatePlan({ precipitationProbability: 50, extremeWarning: false })).toBe(false);
    expect(shouldOfferAlternatePlan({ precipitationProbability: 51, extremeWarning: false })).toBe(true);
    expect(shouldOfferAlternatePlan({ precipitationProbability: 0, extremeWarning: true })).toBe(true);
  });

  it('finds the backup item linked to a primary itinerary item', () => {
    expect(findBackupPlan([primary, backup], primary.id)).toMatchObject({ id: backup.id, backup_for_id: primary.id });
    expect(findBackupPlan([primary], primary.id)).toBeNull();
  });

  it('switches the active item while retaining the primary-to-backup relationship', () => {
    const result = switchToBackupPlan([primary, backup], primary.id);
    expect(result.activeItem?.id).toBe(backup.id);
    expect(result.items.find((item) => item.id === primary.id)?.is_backup).toBe(true);
    expect(result.items.find((item) => item.id === backup.id)?.is_backup).toBe(false);
    expect(result.items.find((item) => item.id === backup.id)?.backup_for_id).toBe(primary.id);
  });
});
