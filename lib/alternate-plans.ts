import type { ItineraryItem } from './itinerary';

export type RainSignal = { precipitationProbability: number | null; extremeWarning: boolean };

/** Rain above the product threshold, or an extreme WMO condition, suggests an indoor plan. */
export function shouldOfferAlternatePlan(weather: RainSignal | null | undefined, threshold = 50): boolean {
  if (!weather) return false;
  return weather.extremeWarning || (weather.precipitationProbability !== null && weather.precipitationProbability > threshold);
}

export function findBackupPlan(items: ItineraryItem[], primaryId: string): ItineraryItem | null {
  return items.find((item) => item.id !== primaryId && item.backup_for_id === primaryId) ?? null;
}

export function switchToBackupPlan(items: ItineraryItem[], primaryId: string): { items: ItineraryItem[]; activeItem: ItineraryItem | null } {
  const backup = findBackupPlan(items, primaryId);
  if (!backup) return { items: [...items], activeItem: null };
  const nextItems = items.map((item) => {
    if (item.id === primaryId) return { ...item, is_backup: true };
    if (item.id === backup.id) return { ...item, is_backup: false };
    return item;
  });
  return { items: nextItems, activeItem: nextItems.find((item) => item.id === backup.id) ?? null };
}
